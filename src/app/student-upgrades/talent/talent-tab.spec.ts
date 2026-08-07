import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TalentTab } from './talent-tab';

describe('TalentTab', () => {
  let component: TalentTab;
  let fixture: ComponentFixture<TalentTab>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TalentTab],
    }).compileComponents();

    fixture = TestBed.createComponent(TalentTab);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
