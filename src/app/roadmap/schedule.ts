export type ScheduleStatus = 'confirmed' | 'predicted';

export interface ScheduleItem {
  pairKey: string;
  name: string;
  type: string | null;
  startDate: string; // ISO
  endDate: string; // ISO
  status: ScheduleStatus;
  notes: string | null;
  isRerun: boolean;
  imageUrl: string | null;
}

export interface Schedule {
  generatedAt: string;
  source: string;
  events: ScheduleItem[];
  banners: ScheduleItem[];
}

/** A single row in the merged timeline the UI renders — one track ('event'|'banner') per row. */
export interface TimelineRow extends ScheduleItem {
  track: 'event' | 'banner';
}
