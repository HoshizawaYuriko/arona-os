import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ElephWeaponTab } from './eleph-weapon-tab';

describe('ElephWeaponTab', () => {
  let component: ElephWeaponTab;
  let fixture: ComponentFixture<ElephWeaponTab>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElephWeaponTab],
    }).compileComponents();

    fixture = TestBed.createComponent(ElephWeaponTab);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});