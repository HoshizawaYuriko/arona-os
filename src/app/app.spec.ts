import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // Empty routes — this is a shell test, not a routing/page-content test, so it
      // shouldn't need the lazy-loaded RoadmapPage (and its HttpClient dependency) at all.
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the nav brand and tool links', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.nav__link')).map((el) => el.textContent);
    expect(compiled.querySelector('.nav__brand')?.textContent).toContain('Arona OS');
    expect(links).toEqual(['Predicted Roadmap', 'Pity System Simulator', 'Student Upgrades']);
  });
});