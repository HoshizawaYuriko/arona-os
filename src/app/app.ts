import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonToggle, MatButtonToggleChange, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';

import { ThemeService } from './theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonToggle, MatButtonToggleGroup, MatIcon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly themeService = inject(ThemeService);

  // Nav brand only — deliberately not index.html's <title> or the project/repo name,
  // which stay "Arona OS" as the actual site identity regardless of theme.
  protected readonly brandName = computed(() =>
    this.themeService.current() === 'dark' ? 'Plana OS' : 'Arona OS',
  );

  protected onThemeChange(event: MatButtonToggleChange): void {
    this.themeService.setTheme(event.value);
  }
}