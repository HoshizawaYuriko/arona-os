import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EquipmentTab } from './equipment-tab';

describe('EquipmentTab', () => {
  let component: EquipmentTab;
  let fixture: ComponentFixture<EquipmentTab>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquipmentTab],
    }).compileComponents();

    fixture = TestBed.createComponent(EquipmentTab);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
