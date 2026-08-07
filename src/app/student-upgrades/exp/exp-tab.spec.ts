import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpTab } from './exp-tab';

describe('ExpTab', () => {
  let component: ExpTab;
  let fixture: ComponentFixture<ExpTab>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpTab],
    }).compileComponents();

    fixture = TestBed.createComponent(ExpTab);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});