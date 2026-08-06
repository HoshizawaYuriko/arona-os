import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'arona-os-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // index.html's inline script already stamped data-theme on <html> before Angular
  // even bootstraps (that's what avoids a flash of the wrong theme on load) — read
  // that back out as the initial value instead of recomputing system preference here.
  private readonly theme = signal<Theme>(
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  );

  readonly current = this.theme.asReadonly();

  setTheme(theme: Theme): void {
    this.theme.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }
}
