import { DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleChange, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';
import { MatSlideToggle, MatSlideToggleChange } from '@angular/material/slide-toggle';

import { TimelineRow } from './schedule';
import { EVENT_CARD_HEIGHT, PX_PER_DAY, daysBetween, layoutLane, monthSegments } from './layout';

const HISTORY_WINDOW_DAYS = 42; // ~6 weeks of past context by default, expandable

// Raw Cargo `Type` values -> display labels — see docs/cargo-schema.md for what each
// one means in-game. `SelectPickupGacha` (the plain, always-available Archive Banner)
// deliberately never appears here since the scraper excludes it entirely.
const BANNER_TYPE_LABELS: Record<string, string> = {
  PickupGacha: 'Standard',
  LimitedGacha: 'Limited',
  FesGacha: 'Fest',
  SelectPickupFesGacha: 'Archive Fest',
  SelectPickupLimitedGacha: 'Archive Limited',
};

// Everything except a routine Standard rotation features characters that are either
// time-limited or otherwise harder to obtain again later — called out with its own
// border treatment so it doesn't blend in next to an ordinary Standard banner.
const CRITICAL_BANNER_TYPES = new Set([
  'LimitedGacha', 'FesGacha', 'SelectPickupFesGacha', 'SelectPickupLimitedGacha',
]);

interface TooltipState {
  row: TimelineRow;
  x: number;
  y: number;
}

@Component({
  selector: 'app-roadmap-timeline',
  imports: [DatePipe, MatButton, MatButtonToggle, MatButtonToggleGroup, MatIcon, MatSlideToggle],
  templateUrl: './roadmap-timeline.html',
  styleUrl: './roadmap-timeline.scss',
})
export class RoadmapTimeline {
  readonly rows = input<TimelineRow[]>([]);

  private readonly scrollEl = viewChild<ElementRef<HTMLElement>>('scrollEl');

  protected readonly showFullHistory = signal(false);
  protected readonly tableView = signal(false);
  protected readonly tooltip = signal<TooltipState | null>(null);

  private readonly today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

  private readonly earliestStart = computed(() => {
    const rows = this.rows();
    if (!rows.length) return this.today;
    return new Date(rows.reduce((min, r) => (r.startDate < min ? r.startDate : min), rows[0].startDate));
  });

  private readonly latestEnd = computed(() => {
    const rows = this.rows();
    if (!rows.length) return this.today;
    return new Date(rows.reduce((max, r) => (r.endDate > max ? r.endDate : max), rows[0].endDate));
  });

  protected readonly rangeStart = computed(() => {
    if (this.showFullHistory()) return this.earliestStart();
    const windowStart = new Date(this.today.getTime() - HISTORY_WINDOW_DAYS * 86_400_000);
    return windowStart < this.earliestStart() ? this.earliestStart() : windowStart;
  });

  protected readonly rangeEnd = computed(() => this.latestEnd());

  protected readonly totalWidth = computed(() =>
    Math.max(daysBetween(this.rangeStart(), this.rangeEnd()) * PX_PER_DAY, 0),
  );

  protected readonly months = computed(() => monthSegments(this.rangeStart(), this.rangeEnd()));

  protected readonly todayLeft = computed(() => daysBetween(this.rangeStart(), this.today) * PX_PER_DAY);

  private visibleRows(track: 'event' | 'banner') {
    const start = this.rangeStart();
    return this.rows().filter((r) => r.track === track && new Date(r.endDate) >= start);
  }

  protected readonly eventLayout = computed(() =>
    layoutLane(this.visibleRows('event'), this.rangeStart(), { fixedHeight: EVENT_CARD_HEIGHT }),
  );
  protected readonly bannerLayout = computed(() => layoutLane(this.visibleRows('banner'), this.rangeStart()));

  // Lane height is no longer subRowCount * a fixed constant — it depends on which
  // durations (1-week vs the taller 2-week cards) actually landed in each sub-row, so
  // layoutLane computes it directly. See layout.ts's doc comment on layoutLane.
  protected readonly eventLaneHeight = computed(() => this.eventLayout().laneHeight);
  protected readonly bannerLaneHeight = computed(() => this.bannerLayout().laneHeight);

  constructor() {
    // Default scroll position: today, with a little breathing room on the left, so the
    // confirmed-to-predicted seam is on screen without the user having to scroll for it.
    effect(() => {
      const width = this.totalWidth();
      const left = this.todayLeft();
      const el = this.scrollEl()?.nativeElement;
      if (el && width > 0) {
        queueMicrotask(() => (el.scrollLeft = Math.max(left - 80, 0)));
      }
    });
  }

  protected jumpToToday(): void {
    const el = this.scrollEl()?.nativeElement;
    if (el) el.scrollLeft = Math.max(this.todayLeft() - 80, 0);
  }

  protected onHistoryToggle(event: MatSlideToggleChange): void {
    this.showFullHistory.set(event.checked);
  }

  protected onViewChange(event: MatButtonToggleChange): void {
    this.tableView.set(event.value === 'table');
  }

  protected showTooltip(row: TimelineRow, event: PointerEvent | FocusEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const hostRect = target.closest('.roadmap')?.getBoundingClientRect();
    this.tooltip.set({
      row,
      x: rect.left - (hostRect?.left ?? 0),
      y: rect.bottom - (hostRect?.top ?? 0) + 6,
    });
  }

  protected hideTooltip(): void {
    this.tooltip.set(null);
  }

  // Display-only — `name` itself stays exactly what the wiki calls the thing, since
  // it's also an identity field (spotting whether the same name has appeared twice is
  // legitimate, e.g. a future rerun filter in the table view). Folding the note in
  // here instead is what caught a real bug report: two "Special Operation: Lore
  // Pursuit" entries looked like a duplicate on the roadmap, but the second one's note
  // was "Season 2" — a distinct continuation, not a rerun of the first. Same idea
  // covers the more common "Rerun" note.
  //
  // Events-only: on banners, Notes carries genuine mechanical flavor text (e.g. "3★
  // characters rate is doubled to 6%" on Fest banners, see docs/cargo-schema.md) rather
  // than identity-distinguishing info — folding that in turned "Arisu (Battle)" into
  // "Arisu (Battle) (5-year anniversary — 3★ characters rate is doubled to 6%)".
  protected displayName(row: TimelineRow): string {
    return row.track === 'event' && row.notes ? `${row.name} (${row.notes})` : row.name;
  }

  protected bannerTypeLabel(type: string | null): string {
    return (type && BANNER_TYPE_LABELS[type]) || type || 'Unknown';
  }

  protected isCriticalBannerType(type: string | null): boolean {
    return !!type && CRITICAL_BANNER_TYPES.has(type);
  }
}