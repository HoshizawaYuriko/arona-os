import { Routes } from '@angular/router';

// Each tool is lazy-loaded (loadComponent) so adding more tools later never grows the
// initial bundle — a route not visited never ships its code. Add new tools here and as
// a link in app.html's nav; everything else (the shell, the outlet) stays untouched.
export const routes: Routes = [
  { path: '', redirectTo: 'roadmap', pathMatch: 'full' },
  {
    path: 'roadmap',
    loadComponent: () => import('./roadmap/roadmap-page').then((m) => m.RoadmapPage),
    title: 'Predicted Roadmap — Arona OS',
  },
  {
    path: 'pity-simulator',
    loadComponent: () =>
      import('./pity-simulator/pity-simulator-page').then((m) => m.PitySimulatorPage),
    title: 'Pity System Simulator — Arona OS',
  },
];