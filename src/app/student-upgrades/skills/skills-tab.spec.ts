import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SkillsTab } from './skills-tab';

describe('SkillsTab', () => {
  let component: SkillsTab;
  let fixture: ComponentFixture<SkillsTab>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkillsTab],
    }).compileComponents();

    fixture = TestBed.createComponent(SkillsTab);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
