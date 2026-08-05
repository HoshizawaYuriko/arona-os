import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ScheduleService } from './services/schedule.service';
import { TimelineRow } from './models/schedule';
import { RoadmapTimeline } from './roadmap/roadmap-timeline';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RoadmapTimeline],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly scheduleService = inject(ScheduleService);

  protected readonly rows = signal<TimelineRow[]>([]);
  protected readonly generatedAt = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    this.scheduleService.getSchedule().subscribe({
      next: (schedule) => this.generatedAt.set(schedule.generatedAt),
      error: () => this.loadError.set('Could not load schedule.json — has the scraper run yet?'),
    });
    this.scheduleService.getTimeline().subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.loadError.set('Could not load schedule.json — has the scraper run yet?'),
    });
  }
}