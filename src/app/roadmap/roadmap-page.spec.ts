import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RoadmapPage } from './roadmap-page';

describe('RoadmapPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoadmapPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(RoadmapPage);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the roadmap title', async () => {
    const fixture = TestBed.createComponent(RoadmapPage);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Predicted Roadmap');
  });
});