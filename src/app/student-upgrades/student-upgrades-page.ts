import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabLink, MatTabNav, MatTabNavPanel } from '@angular/material/tabs';

@Component({
  selector: 'app-student-upgrades-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatTabNav, MatTabLink, MatTabNavPanel],
  templateUrl: './student-upgrades-page.html',
  styleUrl: './student-upgrades-page.scss',
})
export class StudentUpgradesPage {}