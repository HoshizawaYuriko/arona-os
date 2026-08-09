import { Component, computed, HostListener, OnDestroy, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSlider, MatSliderRangeThumb } from '@angular/material/slider';

import {
  cumulativeExpForLevel,
  currentLevelStepProgress,
  expNeededForLevelRange,
  findOptimalCombination,
  levelForCumulativeExp,
} from './exp-calculator';
import { ACTIVITY_REPORTS, CREDITS_PER_EXP, MAX_LEVEL, ReportCounts, ReportId, emptyReportCounts } from './exp-table';

const REPORT_IMAGE_FILENAMES: Record<ReportId, string> = {
  novice: '1_novice_report.png',
  normal: '2_normal_report.png',
  advanced: '3_advanced_report.png',
  superior: '4_superior_report.png',
};

// Stand-in "owned" caps for Auto Select when the user hasn't entered any owned amounts
// yet — lets them try the tool before counting their inventory. Comfortably above
// anything a real target could need (MAX_LEVEL's full climb needs well under 25,000
// even of the smallest report), so it behaves as unlimited without actually being Infinity.
const UNLIMITED_OWNED: ReportCounts = { novice: 999_999, normal: 999_999, advanced: 999_999, superior: 999_999 };

// Press-and-hold tuning for the report images: wait a beat before the repeat kicks in
// (so a quick tap stays a single +1), then ramp the delay between ticks down toward a
// fast floor rather than repeating at one fixed rate the whole time.
const HOLD_INITIAL_DELAY_MS = 400;
const HOLD_MIN_DELAY_MS = 40;
const HOLD_ACCELERATION = 0.8;

@Component({
  selector: 'app-exp-tab',
  imports: [
    MatButton,
    MatFormField,
    MatIcon,
    MatLabel,
    MatInput,
    MatProgressBar,
    MatSlider,
    MatSliderRangeThumb,
  ],
  templateUrl: './exp-tab.html',
  styleUrl: './exp-tab.scss',
})
export class ExpTab implements OnDestroy {
  protected readonly maxLevel = MAX_LEVEL;

  // ACTIVITY_REPORTS is largest-first (load-bearing for findOptimalCombination's own
  // algorithm, see exp-calculator.ts) — the report cards want the opposite, lowest to
  // highest left-to-right, so reverse only for display rather than touching that order.
  protected readonly displayReports = [...ACTIVITY_REPORTS].reverse();

  protected readonly startLevel = signal(1);
  protected readonly targetLevel = signal(MAX_LEVEL);

  protected readonly owned = signal<ReportCounts>(emptyReportCounts());
  protected readonly used = signal<ReportCounts>(emptyReportCounts());

  // Press-and-hold state for the report images — plain fields, not signals, since
  // nothing in the template reads them; they only drive the setTimeout chain itself.
  private holdTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private holdDidRepeat = false;

  private readonly totalExpApplied = computed(() =>
    ACTIVITY_REPORTS.reduce((sum, r) => sum + this.used()[r.id] * r.exp, 0),
  );
  protected readonly usedCreditsCost = computed(() => this.totalExpApplied() * CREDITS_PER_EXP);

  // The one absolute EXP position everything else below is derived from: wherever
  // Start Level begins, plus whatever's currently in the Used Amount fields. Target
  // Level plays no part in this — it's only consulted by autoSelect() on click.
  private readonly rawTotalExp = computed(
    () => cumulativeExpForLevel(this.startLevel()) + this.totalExpApplied(),
  );

  protected readonly resultLevel = computed(() => levelForCumulativeExp(this.rawTotalExp()).level);
  protected readonly stepProgress = computed(() => currentLevelStepProgress(this.rawTotalExp()));
  protected readonly progressPercent = computed(() => {
    const { numerator, denominator } = this.stepProgress();
    // Bar fill itself caps at 100% even while overflowing — the numeric "X/Y" text
    // (bound separately in the template) is what's allowed to read past the denominator.
    return Math.min((numerator / denominator) * 100, 100);
  });

  protected imagePath(id: ReportId): string {
    return `images/student-upgrades/exp/${REPORT_IMAGE_FILENAMES[id]}`;
  }

  // Owned and Used are intentionally decoupled — Owned only feeds Auto Select's search
  // caps (see autoSelect() below); the user can freely set Used past what they own to
  // experiment without having to enter their full inventory first.
  protected updateOwned(id: ReportId, rawValue: string): void {
    const value = Math.max(0, Math.floor(Number(rawValue)) || 0);
    this.owned.update((current) => ({ ...current, [id]: value }));
  }

  protected updateUsed(id: ReportId, rawValue: string): void {
    const value = Math.max(0, Math.floor(Number(rawValue)) || 0);
    this.used.update((current) => ({ ...current, [id]: value }));
  }

  // Clicking a report's image is a quick "+1 used" shortcut — freely, same as the field.
  protected incrementUsed(id: ReportId): void {
    this.used.update((current) => ({ ...current, [id]: current[id] + 1 }));
  }

  // The minus badge only ever renders once Used is already above 0 (see template), but
  // clamp anyway rather than relying solely on that to keep this safe on its own.
  protected decrementUsed(id: ReportId): void {
    this.used.update((current) => ({ ...current, [id]: Math.max(current[id] - 1, 0) }));
  }

  // Holding either the image or the minus badge down repeats the corresponding
  // increment/decrement on an accelerating timer instead of requiring one click per
  // step. A plain click still gets its own single step via onImageClick()/
  // onDecrementClick() below — this only arms the repeat, it never acts on its own, so
  // a quick tap (pointerdown+pointerup before the initial delay elapses) isn't
  // double-counted.
  protected onPressStart(id: ReportId, direction: 'increment' | 'decrement'): void {
    this.clearHoldTimer();
    this.holdDidRepeat = false;
    this.scheduleHoldTick(id, HOLD_INITIAL_DELAY_MS, direction);
  }

  // Window-level, not just the element's own (pointerup)/(pointerleave)/(pointercancel)
  // in the template: those normally suffice, but starting a native browser drag (e.g.
  // dragging the activity report image mid-hold, before draggable="false" was added)
  // can swallow the pointer gesture without ever dispatching pointerup/pointercancel
  // back to the pressed element, leaving the accelerating hold timer running forever in
  // the background. Listening on the window as well means release is caught regardless
  // of which element (or none) the pointer ends up over.
  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  protected onPressEnd(): void {
    this.clearHoldTimer();
  }

  // The click that fires on release after a hold already repeated shouldn't add one
  // more on top — only a hold-free tap should reach incrementUsed() here.
  protected onImageClick(id: ReportId): void {
    if (this.holdDidRepeat) {
      this.holdDidRepeat = false;
      return;
    }
    this.incrementUsed(id);
  }

  // Same double-count guard as onImageClick(), for the minus badge's own plain tap.
  protected onDecrementClick(id: ReportId): void {
    if (this.holdDidRepeat) {
      this.holdDidRepeat = false;
      return;
    }
    this.decrementUsed(id);
  }

  private scheduleHoldTick(id: ReportId, delay: number, direction: 'increment' | 'decrement'): void {
    this.holdTimeoutId = setTimeout(() => {
      this.holdDidRepeat = true;
      if (direction === 'increment') {
        this.incrementUsed(id);
      } else {
        this.decrementUsed(id);
        if (this.used()[id] === 0) {
          // Nothing left to take away, and the minus badge itself is about to vanish
          // (it only renders while Used > 0 — see template), taking its own
          // pointerup/pointerleave listeners with it. Stop here rather than leave a
          // dangling timer waiting for a release that can no longer reach us.
          this.clearHoldTimer();
          return;
        }
      }
      this.scheduleHoldTick(id, Math.max(delay * HOLD_ACCELERATION, HOLD_MIN_DELAY_MS), direction);
    }, delay);
  }

  private clearHoldTimer(): void {
    if (this.holdTimeoutId !== null) {
      clearTimeout(this.holdTimeoutId);
      this.holdTimeoutId = null;
    }
  }

  ngOnDestroy(): void {
    this.clearHoldTimer();
  }

  protected resetOwned(): void {
    this.owned.set(emptyReportCounts());
  }

  protected resetUsed(): void {
    this.used.set(emptyReportCounts());
  }

  protected autoSelect(): void {
    const targetExp = expNeededForLevelRange(this.startLevel(), this.targetLevel());
    const owned = this.owned();
    // If nothing's been entered as owned yet, search as if every report were available
    // in effectively unlimited supply rather than reporting "target unreachable" against
    // an inventory of zero. The moment any one report has a real owned amount, treat the
    // whole set as the user's actual (possibly zero-for-some) inventory.
    const caps = ACTIVITY_REPORTS.every((r) => owned[r.id] === 0) ? UNLIMITED_OWNED : owned;
    this.used.set(findOptimalCombination(targetExp, caps).combination);
  }

  // Range slider's two thumbs are independent inputs — keep start <= target no matter
  // which one the user just dragged, rather than letting them cross.
  protected onStartLevelChange(value: number): void {
    this.startLevel.set(Math.min(value, this.targetLevel()));
  }

  protected onTargetLevelChange(value: number): void {
    this.targetLevel.set(Math.max(value, this.startLevel()));
  }
}