import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MenuSidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-menu-page',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MenuSidebarComponent],
  templateUrl: './menu-page.component.html',
  styleUrls: ['./menu-page.component.scss']
})
export class MenuPageComponent implements OnInit {
  showSidebar = signal<boolean>(true);

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.updateSidebarState(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(event => {
      this.updateSidebarState((event as NavigationEnd).url);
    });
  }

  private updateSidebarState(url: string): void {
    this.showSidebar.set(!url.includes('/menu/song/'));
  }
}
