import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudentUpgradesPage } from './student-upgrades-page';

describe('StudentUpgradesPage', () => {
  let component: StudentUpgradesPage;
  let fixture: ComponentFixture<StudentUpgradesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentUpgradesPage],
      // Needed once the template gained RouterLink/RouterLinkActive/RouterOutlet for
      // the tab-nav-bar — this is a shell test, not a routing test, so empty routes.
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(StudentUpgradesPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
