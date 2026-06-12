import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter, tap } from 'rxjs/operators';
import { AuthService, User } from '../../../app/services/auth.service';
import { MessageService } from '../../../app/services/message.service';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  isAction?: boolean;
  isSecluded?: boolean;
}

@Component({
  selector: 'app-menu-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class MenuSidebarComponent implements OnInit {
  menuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'fas fa-house', route: '/menu' },
    { label: 'Profile', icon: 'fas fa-user', route: '/profile' },
    { label: 'Leaderboard', icon: 'fas fa-trophy', route: '/leaderboard' },
    { label: 'Chart Maker', icon: 'fas fa-pen-ruler', route: '/chart-maker' },
    { label: 'About', icon: 'fas fa-circle-info', route: '/about', isSecluded: true },
    { label: 'Patch Notes', icon: 'fas fa-clipboard-list', route: '/about/patch-notes', isSecluded: true },
    { label: 'Settings', icon: 'fas fa-gear', route: '/settings' },
    { label: 'Messages', icon: 'fas fa-envelope', route: '/messages' },
    { label: 'Analytics', icon: 'fas fa-chart-line', route: '/analytics' },
    { label: 'Logout', icon: 'fas fa-right-from-bracket', route: '/logout', isAction: true }
  ];

  activeItem = signal<string>('Dashboard');
  currentUser = signal<User | null>(null);
  unreadMessageCount = signal<number>(0);
  menuImageError = signal<boolean>(false);

  constructor(
    private authService: AuthService,
    private messageService: MessageService,
    private router: Router
  ) {
    this.currentUser.set(this.authService.currentUser);
  }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      tap(user => {
        this.currentUser.set(user);
        this.menuImageError.set(false);
        this.loadUnreadCount();
      })
    ).subscribe();

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      tap(() => this.loadUnreadCount())
    ).subscribe();

    this.loadUnreadCount();
  }

  setActive(item: string): void {
    this.activeItem.set(item);
    if (item === 'Logout') {
      this.logout();
      return;
    }
    const found = this.menuItems.find(i => i.label === item);
    if (found?.route) {
      void this.router.navigate([found.route]);
    }
  }

  navigateToProfile(): void {
    void this.router.navigate(['/profile']);
    this.activeItem.set('Profile');
  }

  onMenuImageError(): void {
    this.menuImageError.set(true);
  }

  private loadUnreadCount(): void {
    const user = this.currentUser();
    if (!user) return;
    this.messageService.getUnreadCount(user.id).subscribe({
      next: response => {
        if (response.success) {
          this.unreadMessageCount.set(response.count);
        }
      }
    });
  }

  private logout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }
}
