// Levels 1-90, hardcoded from https://bluearchive.wiki/wiki/Character_Exp_table —
// fetched once and copied in, not scraped live. Verified before copying: 90 rows,
// self-consistent (cumulative[i] + expToNext[i] === cumulative[i+1] for every i), and the
// wiki page's own calculator widget config (data-levelcap="90" data-creditprice="7")
// matches the level cap and credit rate given separately for this feature.

export const MAX_LEVEL = 90;
export const CREDITS_PER_EXP = 7;

/** Cumulative EXP required to *reach* each level. Index 0 = level 1 (always 0 — you start there). */
export const CUMULATIVE_EXP_BY_LEVEL: readonly number[] = [
  0, 10, 35, 75, 130, 200, 275, 355, 445, 540,
  645, 760, 890, 1035, 1195, 1370, 1555, 1755, 1970, 2200,
  2585, 3010, 3490, 4025, 4605, 5240, 6025, 6870, 7765, 8690,
  9665, 10675, 11770, 12935, 14185, 15520, 16945, 18490, 20115, 21800,
  23535, 25335, 27310, 29475, 31845, 34430, 37245, 40310, 43650, 47295,
  51280, 55645, 60435, 65700, 71495, 77880, 84920, 92685, 101250, 110695,
  121105, 132570, 145185, 159050, 174270, 190955, 209220, 229185, 250975, 274720,
  300420, 328075, 357685, 389250, 422770, 458245, 495675, 535060, 574445, 613830,
  653215, 692600, 731985, 771370, 814665, 866930, 936130, 1020550, 1123540, 1249185,
];

export type ReportId = 'novice' | 'normal' | 'advanced' | 'superior';

export interface ActivityReportType {
  id: ReportId;
  name: string;
  exp: number;
}

// Largest first — every algorithm in exp-calculator.ts wants to consider big
// denominations before small ones, so this order is load-bearing, not cosmetic.
export const ACTIVITY_REPORTS: readonly ActivityReportType[] = [
  { id: 'superior', name: 'Superior Activity Report', exp: 10000 },
  { id: 'advanced', name: 'Advanced Activity Report', exp: 2000 },
  { id: 'normal', name: 'Normal Activity Report', exp: 500 },
  { id: 'novice', name: 'Novice Activity Report', exp: 50 },
];

export type ReportCounts = Record<ReportId, number>;

export function emptyReportCounts(): ReportCounts {
  return { novice: 0, normal: 0, advanced: 0, superior: 0 };
}