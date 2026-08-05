import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { Schedule, TimelineRow } from '../models/schedule';

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly http = inject(HttpClient);

  // Same-origin static asset — this is the file scraper/index.mjs writes and `ng build`
  // bundles from public/. No backend, no CORS, just a plain GET.
  private readonly dataUrl = 'data/schedule.json';

  getSchedule(): Observable<Schedule> {
    return this.http.get<Schedule>(this.dataUrl);
  }

  getTimeline(): Observable<TimelineRow[]> {
    return this.getSchedule().pipe(
      map((schedule) => {
        const rows: TimelineRow[] = [
          ...schedule.events.map((e) => ({ ...e, track: 'event' as const })),
          ...schedule.banners.map((b) => ({ ...b, track: 'banner' as const })),
        ];
        return rows.sort((a, b) => a.startDate.localeCompare(b.startDate));
      }),
    );
  }
}