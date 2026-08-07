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
  {
    path: 'student-upgrades',
    loadComponent: () =>
      import('./student-upgrades/student-upgrades-page').then((m) => m.StudentUpgradesPage),
    title: 'Student Upgrades — Arona OS',
    // Each tab is its own child route (not mat-tab-group's local content-switching) so
    // every upgrade type stays independently lazy-loaded as more get added — the same
    // "a tool nobody visits never ships its code" principle as the top-level tools
    // above, just one level deeper.
    children: [
      { path: '', redirectTo: 'exp', pathMatch: 'full' },
      {
        path: 'skills',
        loadComponent: () => import('./student-upgrades/skills/skills-tab').then((m) => m.SkillsTab),
        title: 'Skills — Student Upgrades — Arona OS',
      },
      {
        path: 'equipment',
        loadComponent: () =>
          import('./student-upgrades/equipment/equipment-tab').then((m) => m.EquipmentTab),
        title: 'Equipment — Student Upgrades — Arona OS',
      },
      {
        path: 'exp',
        loadComponent: () => import('./student-upgrades/exp/exp-tab').then((m) => m.ExpTab),
        title: 'Level Up — Student Upgrades — Arona OS',
      },
      {
        path: 'eleph-weapon',
        loadComponent: () =>
          import('./student-upgrades/eleph-weapon/eleph-weapon-tab').then((m) => m.ElephWeaponTab),
        title: 'Mystic Unlock & Weapon Growth — Student Upgrades — Arona OS',
      },
      {
        path: 'talent',
        loadComponent: () => import('./student-upgrades/talent/talent-tab').then((m) => m.TalentTab),
        title: 'Talent — Student Upgrades — Arona OS',
      },
    ],
  },
];