import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Starterpage } from './starterpage';

describe('Starterpage', () => {
  let component: Starterpage;
  let fixture: ComponentFixture<Starterpage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Starterpage],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Starterpage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
