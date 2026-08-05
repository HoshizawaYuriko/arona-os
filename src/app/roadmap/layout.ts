// Pure date-math for laying the timeline out — kept framework-free so it's easy to
// unit test and to reason about independently of the rendering component.
import { TimelineRow } from '../models/schedule';

// bluearchive.wiki's banner/event art is a fixed 612×288px (≈17:8, confirmed against
// the actual files).
const IMAGE_ASPECT = 612 / 288;

export const PX_PER_DAY = 22;
export const SUBROW_GAP = 8;
const BAR_INSET = 2; // shaves each card's edges so touching (end === start) cards still show a seam

// Banners are almost always 1-week, so deriving height from width (below) keeps them
// short. Events routinely run 2 weeks — doing the same for them made a 2-week card
// exactly double height too, tall enough that the whole roadmap stopped fitting a
// normal browser window. Events get a fixed height instead: the card stays capped no
// matter how wide the date span makes it, and the art is centered + object-fit:
// contain (see roadmap-timeline.scss) rather than stretched/cropped to fill it.
export const EVENT_CARD_HEIGHT = 80;

const DAY_MS = 86_400_000;

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY_MS;
}

export function heightForWidth(width: number): number {
  return width / IMAGE_ASPECT;
}

export interface LaidOutBar {
  row: TimelineRow;
  left: number;
  width: number;
  height: number;
  top: number;
  subRow: number;
}

/**
 * Greedy interval packing: each row goes in the first sub-row whose last-placed item
 * already ended by this row's start. Verified against real data that this is load-
 * bearing, not defensive — banners overlap ~58% of the time (up to 6 concurrent) since
 * Blue Archive routinely runs several rate-up banners side by side.
 *
 * Sub-row height isn't a single fixed constant across lanes: when heights are
 * width-derived (banners), a given sub-row index can hold a 1-week card at one point
 * in time and a (taller) 2-week card at another, so each sub-row's band is sized to
 * the tallest card that ever lands in it, and every card is top-aligned within its
 * band rather than centered or stretched. Pass `fixedHeight` (events) to skip all of
 * that and give every sub-row the same capped height instead.
 */
export function layoutLane(
  rows: TimelineRow[],
  rangeStart: Date,
  { fixedHeight }: { fixedHeight?: number } = {},
): { bars: LaidOutBar[]; laneHeight: number } {
  const sorted = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const subRowEnds: number[] = [];
  const subRowMaxHeight: number[] = [];
  const placed: Array<{ row: TimelineRow; left: number; width: number; height: number; subRow: number }> = [];

  for (const row of sorted) {
    const start = new Date(row.startDate);
    const end = new Date(row.endDate);
    const left = daysBetween(rangeStart, start) * PX_PER_DAY + BAR_INSET;
    const width = Math.max(daysBetween(start, end) * PX_PER_DAY - BAR_INSET * 2, 4);
    const height = fixedHeight ?? heightForWidth(width);

    let subRow = subRowEnds.findIndex((endMs) => endMs <= start.getTime());
    if (subRow === -1) {
      subRow = subRowEnds.length;
      subRowEnds.push(end.getTime());
      subRowMaxHeight.push(height);
    } else {
      subRowEnds[subRow] = end.getTime();
      subRowMaxHeight[subRow] = Math.max(subRowMaxHeight[subRow], height);
    }
    placed.push({ row, left, width, height, subRow });
  }

  const subRowTop: number[] = [];
  let cursor = SUBROW_GAP;
  for (const maxHeight of subRowMaxHeight) {
    subRowTop.push(cursor);
    cursor += maxHeight + SUBROW_GAP;
  }

  const bars: LaidOutBar[] = placed.map((b) => ({ ...b, top: subRowTop[b.subRow] }));

  // Minimum lane height for the (rare) empty-lane case, so it doesn't collapse to
  // near-zero — same reference size a real card would use.
  const minHeight = fixedHeight ?? heightForWidth(PX_PER_DAY * 7);
  return { bars, laneHeight: Math.max(cursor, minHeight + SUBROW_GAP * 2) };
}

export interface MonthSegment {
  label: string;
  left: number;
  width: number;
}

/** Month gridline/label segments, clipped to [rangeStart, rangeEnd]. */
export function monthSegments(rangeStart: Date, rangeEnd: Date): MonthSegment[] {
  const segments: MonthSegment[] = [];
  let cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));

  while (cursor < rangeEnd) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const segStart = cursor < rangeStart ? rangeStart : cursor;
    const segEnd = next > rangeEnd ? rangeEnd : next;
    segments.push({
      label: cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      left: daysBetween(rangeStart, segStart) * PX_PER_DAY,
      width: daysBetween(segStart, segEnd) * PX_PER_DAY,
    });
    cursor = next;
  }

  return segments;
}
