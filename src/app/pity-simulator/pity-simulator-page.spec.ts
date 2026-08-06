import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PitySimulatorPage } from './pity-simulator-page';

describe('PitySimulatorPage', () => {
  let component: PitySimulatorPage;
  let fixture: ComponentFixture<PitySimulatorPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PitySimulatorPage],
    }).compileComponents();

    fixture = TestBed.createComponent(PitySimulatorPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
