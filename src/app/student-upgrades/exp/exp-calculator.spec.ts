import { CUMULATIVE_EXP_BY_LEVEL, MAX_LEVEL, ReportCounts, emptyReportCounts } from './exp-table';
import {
  calculateResultingLevel,
  cumulativeExpForLevel,
  currentLevelStepProgress,
  expNeededForLevelRange,
  findOptimalCombination,
  levelForCumulativeExp,
} from './exp-calculator';

describe('cumulativeExpForLevel', () => {
  it('level 1 needs 0 EXP', () => {
    expect(cumulativeExpForLevel(1)).toBe(0);
  });

  it('level 90 matches the table total', () => {
    expect(cumulativeExpForLevel(90)).toBe(1249185);
  });

  it('clamps below 1 and above MAX_LEVEL', () => {
    expect(cumulativeExpForLevel(0)).toBe(cumulativeExpForLevel(1));
    expect(cumulativeExpForLevel(999)).toBe(cumulativeExpForLevel(90));
  });
});

describe('levelForCumulativeExp', () => {
  it('lands exactly on a level boundary with zero progress into it', () => {
    const result = levelForCumulativeExp(CUMULATIVE_EXP_BY_LEVEL[29]); // level 30
    expect(result.level).toBe(30);
    expect(result.expIntoLevel).toBe(0);
    expect(result.expToNextLevel).toBe(CUMULATIVE_EXP_BY_LEVEL[30] - CUMULATIVE_EXP_BY_LEVEL[29]);
  });

  it('reports partial progress into a level', () => {
    const result = levelForCumulativeExp(CUMULATIVE_EXP_BY_LEVEL[29] + 100);
    expect(result.level).toBe(30);
    expect(result.expIntoLevel).toBe(100);
  });

  it('caps at MAX_LEVEL with no next level, regardless of how far over the total is', () => {
    const result = levelForCumulativeExp(CUMULATIVE_EXP_BY_LEVEL[MAX_LEVEL - 1] + 999_999);
    expect(result.level).toBe(MAX_LEVEL);
    expect(result.expToNextLevel).toBeNull();
  });
});

describe('calculateResultingLevel', () => {
  it('gains levels from a mix of reports and reports the right EXP/credits totals', () => {
    const reports: ReportCounts = { ...emptyReportCounts(), novice: 2, normal: 1 }; // 2*50 + 1*500 = 600
    const result = calculateResultingLevel(1, reports);
    expect(result.totalExpGained).toBe(600);
    expect(result.creditsCost).toBe(600 * 7);
    expect(result.wastedExp).toBe(0);
    // 600 EXP from level 1 lands inside level 10's range (level 10 starts at 540)
    expect(result.resultLevel).toBe(10);
  });

  it('flags wasted EXP once past MAX_LEVEL instead of silently discarding it', () => {
    const reports: ReportCounts = { ...emptyReportCounts(), superior: 1000 }; // way past level 90
    const result = calculateResultingLevel(90, reports);
    expect(result.resultLevel).toBe(MAX_LEVEL);
    expect(result.expToNextLevel).toBeNull();
    expect(result.wastedExp).toBeGreaterThan(0);
    // wasted + actually-applied should equal the raw total granted
    expect(result.wastedExp + CUMULATIVE_EXP_BY_LEVEL[MAX_LEVEL - 1]).toBe(
      cumulativeExpForLevel(90) + result.totalExpGained,
    );
  });
});

describe('expNeededForLevelRange', () => {
  it('matches the difference between two levels\' cumulative requirements', () => {
    expect(expNeededForLevelRange(30, 90)).toBe(
      CUMULATIVE_EXP_BY_LEVEL[89] - CUMULATIVE_EXP_BY_LEVEL[29],
    );
  });

  it('never goes negative for a reversed range', () => {
    expect(expNeededForLevelRange(90, 30)).toBe(0);
  });
});

describe('currentLevelStepProgress', () => {
  it('reports progress within the current step, not the whole start-to-target range', () => {
    // Level 74 -> 75 needs 33520 EXP (cumulative[74] - cumulative[73]); 100 EXP in.
    const totalExp = CUMULATIVE_EXP_BY_LEVEL[73] + 100;
    const result = currentLevelStepProgress(totalExp);
    expect(result.stepLevel).toBe(74);
    expect(result.numerator).toBe(100);
    expect(result.denominator).toBe(CUMULATIVE_EXP_BY_LEVEL[74] - CUMULATIVE_EXP_BY_LEVEL[73]);
    expect(result.isOverflowing).toBe(false);
  });

  it('reads as a full, non-overflowing bar exactly at MAX_LEVEL with zero excess', () => {
    const result = currentLevelStepProgress(CUMULATIVE_EXP_BY_LEVEL[MAX_LEVEL - 1]);
    const lastStepSize = CUMULATIVE_EXP_BY_LEVEL[MAX_LEVEL - 1] - CUMULATIVE_EXP_BY_LEVEL[MAX_LEVEL - 2];
    expect(result.stepLevel).toBe(MAX_LEVEL);
    expect(result.numerator).toBe(lastStepSize);
    expect(result.denominator).toBe(lastStepSize);
    expect(result.isOverflowing).toBe(false);
  });

  it('matches the worked example exactly: 300 EXP over cap reads as "125945/125645"', () => {
    const result = currentLevelStepProgress(CUMULATIVE_EXP_BY_LEVEL[MAX_LEVEL - 1] + 300);
    expect(result.denominator).toBe(125645);
    expect(result.numerator).toBe(125945);
    expect(result.isOverflowing).toBe(true);
    expect(result.overflowAmount).toBe(300);
  });
});

describe('findOptimalCombination', () => {
  it('unconstrained: reaches the target with less than one report of overflow-headroom', () => {
    const owned: ReportCounts = { novice: 9999, normal: 9999, advanced: 9999, superior: 9999 };
    const target = 123_456;
    const result = findOptimalCombination(target, owned);
    expect(result.achievable).toBe(true);
    expect(result.overflowExp).toBeLessThan(50); // 50 EXP is the finest denomination
    expect(result.totalExpGranted).toBe(
      result.combination.novice * 50 +
        result.combination.normal * 500 +
        result.combination.advanced * 2000 +
        result.combination.superior * 10000,
    );
  });

  it('respects owned caps rather than assuming unlimited supply', () => {
    // No superior/advanced available at all — must make do with normal + novice only.
    const owned: ReportCounts = { novice: 5, normal: 3, advanced: 0, superior: 0 };
    const target = 1600; // 3*500 + 2*50 = 1600 exactly
    const result = findOptimalCombination(target, owned);
    expect(result.achievable).toBe(true);
    expect(result.combination.advanced).toBe(0);
    expect(result.combination.superior).toBe(0);
    expect(result.combination.normal).toBeLessThanOrEqual(3);
    expect(result.combination.novice).toBeLessThanOrEqual(5);
    expect(result.overflowExp).toBe(0);
  });

  it('reports a shortfall instead of a false answer when owned reports can never reach the target', () => {
    const owned: ReportCounts = { novice: 1, normal: 0, advanced: 0, superior: 0 }; // only 50 EXP available
    const result = findOptimalCombination(10_000, owned);
    expect(result.achievable).toBe(false);
    expect(result.totalExpGranted).toBe(50);
    expect(result.shortfallExp).toBe(10_000 - 50);
  });

  it('matches brute force on a small capped case (cross-check the DP, not just plausibility)', () => {
    const owned: ReportCounts = { novice: 4, normal: 3, advanced: 2, superior: 1 };
    const target = 4321;

    let bruteBestOverflow = Infinity;
    for (let s = 0; s <= owned.superior; s++) {
      for (let a = 0; a <= owned.advanced; a++) {
        for (let n = 0; n <= owned.normal; n++) {
          for (let nv = 0; nv <= owned.novice; nv++) {
            const total = s * 10000 + a * 2000 + n * 500 + nv * 50;
            if (total >= target) bruteBestOverflow = Math.min(bruteBestOverflow, total - target);
          }
        }
      }
    }

    const result = findOptimalCombination(target, owned);
    expect(result.achievable).toBe(true);
    expect(result.overflowExp).toBe(bruteBestOverflow);
  });
});