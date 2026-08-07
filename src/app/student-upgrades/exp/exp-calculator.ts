import {
  ACTIVITY_REPORTS,
  CREDITS_PER_EXP,
  CUMULATIVE_EXP_BY_LEVEL,
  MAX_LEVEL,
  ReportCounts,
  ReportId,
  emptyReportCounts,
} from './exp-table';

// Smallest report (50 EXP) — every denomination is an exact multiple of this, so the
// combination search below works in these units instead of raw EXP for a ~50x smaller
// (and therefore fast) search space.
const UNIT_EXP = Math.min(...ACTIVITY_REPORTS.map((r) => r.exp));

function toUnits(exp: number): number {
  return exp / UNIT_EXP;
}

export function cumulativeExpForLevel(level: number): number {
  const clamped = Math.min(Math.max(level, 1), MAX_LEVEL);
  return CUMULATIVE_EXP_BY_LEVEL[clamped - 1];
}

export interface LevelProgress {
  level: number;
  expIntoLevel: number;
  /** EXP still needed to reach the next level, or null if already at MAX_LEVEL. */
  expToNextLevel: number | null;
}

/**
 * Given a total (cumulative) EXP amount, finds which level that lands on. Clamps
 * internally (both negative and beyond-MAX_LEVEL) so it's safe to call with a raw,
 * un-pre-clamped total — callers that also need to know the *unclamped* raw value
 * (e.g. to report wasted EXP) just keep their own copy of it alongside this call.
 */
export function levelForCumulativeExp(totalExp: number): LevelProgress {
  const maxTotal = CUMULATIVE_EXP_BY_LEVEL[MAX_LEVEL - 1];
  const clampedTotal = Math.min(Math.max(totalExp, 0), maxTotal);
  // Table is sorted ascending — walk down from the top to find the highest level
  // whose requirement is still met. Only 90 entries, a linear scan is plenty fast.
  let level = 1;
  for (let i = CUMULATIVE_EXP_BY_LEVEL.length - 1; i >= 0; i--) {
    if (CUMULATIVE_EXP_BY_LEVEL[i] <= clampedTotal) {
      level = i + 1;
      break;
    }
  }
  const expIntoLevel = clampedTotal - cumulativeExpForLevel(level);
  const expToNextLevel = level < MAX_LEVEL ? cumulativeExpForLevel(level + 1) - clampedTotal : null;
  return { level, expIntoLevel, expToNextLevel };
}

/** EXP gap between two levels — what "Auto Select" needs the report combination to cover. */
export function expNeededForLevelRange(fromLevel: number, toLevel: number): number {
  return Math.max(cumulativeExpForLevel(toLevel) - cumulativeExpForLevel(fromLevel), 0);
}

export interface LevelStepProgress {
  /** The level whose "step to next" this represents (MAX_LEVEL itself for the virtual overflow step). */
  stepLevel: number;
  /** Numerator of the "X/Y" progress display — can exceed `denominator`, but only when overflowing past MAX_LEVEL. */
  numerator: number;
  denominator: number;
  isOverflowing: boolean;
  overflowAmount: number;
}

/**
 * Progress within whichever single level-step `totalExp` currently sits in — not the
 * whole start→target range, just the one gate immediately ahead, advancing to the next
 * step as `totalExp` crosses each boundary. Past MAX_LEVEL there's no real "next" step to
 * measure against, so the virtual one reuses the last real step's size (level 89→90) as
 * its denominator; the numerator then keeps climbing past that value instead of
 * resetting to a small fraction that could be mistaken for real progress on a new step —
 * verified against a concrete worked example: 300 EXP over cap reads as "125945/125645",
 * not "300/125645".
 */
export function currentLevelStepProgress(totalExp: number): LevelStepProgress {
  const maxTotal = CUMULATIVE_EXP_BY_LEVEL[MAX_LEVEL - 1];
  const lastStepSize = maxTotal - cumulativeExpForLevel(MAX_LEVEL - 1);

  if (totalExp >= maxTotal) {
    const overflowAmount = Math.max(totalExp - maxTotal, 0);
    return {
      stepLevel: MAX_LEVEL,
      numerator: lastStepSize + overflowAmount,
      denominator: lastStepSize,
      isOverflowing: overflowAmount > 0,
      overflowAmount,
    };
  }

  const { level, expIntoLevel } = levelForCumulativeExp(totalExp);
  return {
    stepLevel: level,
    numerator: expIntoLevel,
    denominator: cumulativeExpForLevel(level + 1) - cumulativeExpForLevel(level),
    isOverflowing: false,
    overflowAmount: 0,
  };
}

export interface ForwardCalcResult {
  totalExpGained: number;
  resultLevel: number;
  expIntoResultLevel: number;
  expToNextLevel: number | null;
  /** EXP beyond MAX_LEVEL's requirement that did nothing — reports "used" for no gain. */
  wastedExp: number;
  creditsCost: number;
}

/** Apply exactly these reports from `currentLevel`, see where it lands. */
export function calculateResultingLevel(currentLevel: number, reportsUsed: ReportCounts): ForwardCalcResult {
  const startingExp = cumulativeExpForLevel(currentLevel);
  const totalExpGained = ACTIVITY_REPORTS.reduce((sum, r) => sum + reportsUsed[r.id] * r.exp, 0);
  const rawNewTotal = startingExp + totalExpGained;
  const maxTotal = CUMULATIVE_EXP_BY_LEVEL[MAX_LEVEL - 1];
  const { level, expIntoLevel, expToNextLevel } = levelForCumulativeExp(rawNewTotal);
  return {
    totalExpGained,
    resultLevel: level,
    expIntoResultLevel: expIntoLevel,
    expToNextLevel,
    wastedExp: Math.max(rawNewTotal - maxTotal, 0),
    creditsCost: totalExpGained * CREDITS_PER_EXP,
  };
}

export interface OptimalCombinationResult {
  achievable: boolean;
  combination: ReportCounts;
  totalExpGranted: number;
  overflowExp: number;
  creditsCost: number;
  /** Only meaningful when !achievable — how much more EXP is needed past every owned report. */
  shortfallExp: number;
}

/**
 * "Auto Select": find the combination of owned reports that covers `targetExp` with the
 * least possible overflow, using the fewest reports among ties.
 *
 * All four denominations are exact multiples of the smallest (50 | 500 | 2000 | 10000),
 * which is what makes "minimum overflow" solvable exactly rather than heuristically: work
 * in units of 50, then it's a bounded knapsack — minimize the report *count* needed to
 * reach each achievable sum, subject to each report's owned quantity as a cap. Solved via
 * the standard binary-splitting decomposition (each report's cap split into O(log cap)
 * groups, each treated as one 0/1 pseudo-item) rather than one DP pass per individual
 * report — this matters once someone types a large owned count, not just for tidiness.
 */
export function findOptimalCombination(targetExp: number, owned: ReportCounts): OptimalCombinationResult {
  if (targetExp <= 0) {
    return {
      achievable: true,
      combination: emptyReportCounts(),
      totalExpGranted: 0,
      overflowExp: 0,
      creditsCost: 0,
      shortfallExp: 0,
    };
  }

  const targetUnits = Math.ceil(targetExp / UNIT_EXP);
  // Minimum possible overflow when ANY denomination is available is bounded by that
  // denomination's own size; Superior (10000 EXP) is the largest, so its unit value is
  // always enough search headroom regardless of which denominations are actually owned.
  const margin = toUnits(Math.max(...ACTIVITY_REPORTS.map((r) => r.exp)));
  const maxUnits = targetUnits + margin;

  const dp = new Array<number>(maxUnits + 1).fill(Infinity);
  dp[0] = 0;
  const choice: Array<{ id: ReportId; weight: number; count: number } | null> = new Array(maxUnits + 1).fill(
    null,
  );

  for (const report of ACTIVITY_REPORTS) {
    const cap = owned[report.id];
    if (cap <= 0) continue;
    const value = toUnits(report.exp);
    let remaining = cap;
    let groupSize = 1;
    while (remaining > 0) {
      const count = Math.min(groupSize, remaining);
      const weight = count * value;
      for (let s = maxUnits; s >= weight; s--) {
        if (dp[s - weight] + count < dp[s]) {
          dp[s] = dp[s - weight] + count;
          choice[s] = { id: report.id, weight, count };
        }
      }
      remaining -= count;
      groupSize *= 2;
    }
  }

  let bestUnits = -1;
  for (let s = targetUnits; s <= maxUnits; s++) {
    if (dp[s] < Infinity) {
      bestUnits = s;
      break;
    }
  }

  if (bestUnits === -1) {
    // Every owned report combined still isn't enough — show how far short, using all of them.
    const totalOwnedExp = ACTIVITY_REPORTS.reduce((sum, r) => sum + owned[r.id] * r.exp, 0);
    const combination = emptyReportCounts();
    for (const report of ACTIVITY_REPORTS) combination[report.id] = owned[report.id];
    return {
      achievable: false,
      combination,
      totalExpGranted: totalOwnedExp,
      overflowExp: 0,
      creditsCost: totalOwnedExp * CREDITS_PER_EXP,
      shortfallExp: targetExp - totalOwnedExp,
    };
  }

  const combination = emptyReportCounts();
  let s = bestUnits;
  while (s > 0) {
    const step = choice[s];
    if (!step) break; // defensive only — unreachable once dp[bestUnits] is finite
    combination[step.id] += step.count;
    s -= step.weight;
  }

  const totalExpGranted = bestUnits * UNIT_EXP;
  return {
    achievable: true,
    combination,
    totalExpGranted,
    overflowExp: totalExpGranted - targetExp,
    creditsCost: totalExpGranted * CREDITS_PER_EXP,
    shortfallExp: 0,
  };
}