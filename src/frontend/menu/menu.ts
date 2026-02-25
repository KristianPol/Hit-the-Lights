import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService, User } from '../../app/services/auth.service';

interface Song {
  id: number;
  name: string;
  author: string;
  length: string;
  bpm: number;
  cover: string;
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './menu.html',
  styleUrls: ['./menu.scss']
})
export class MenuComponent {
  menuItems = [
    { label: 'Dashboard', icon: '◆', route: '/dashboard' },
    { label: 'Profile', icon: '◎', route: '/profile' },
    { label: 'Settings', icon: '⚙', route: '/settings' },
    { label: 'Messages', icon: '✉', route: '/messages', badge: 3 },
    { label: 'Analytics', icon: '◈', route: '/analytics' },
    { label: 'Logout', icon: '→', route: '/logout', isAction: true }
  ];

  activeItem = 'Dashboard';
  currentUser: User | null;

  songs: Song[] = [
    {
      id: 1,
      name: 'Parabola',
      author: 'TOOL',
      length: '6:03',
      bpm: 79,
      cover: '🌃'
    },
    {
      id: 2,
      name: 'Nightcall',
      author: 'Kavinsky',
      length: '4:18',
      bpm: 92,
      cover: '🏎️'
    },
    {
      id: 3,
      name: 'Instant Crush',
      author: 'Daft Punk',
      length: '5:37',
      bpm: 110,
      cover: '🤖'
    }
  ];

  selectedSong: Song | null = null;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    this.currentUser = this.authService.currentUser;
  }

  setActive(item: string) {
    this.activeItem = item;
    
    // Handle logout action
    if (item === 'Logout') {
      this.logout();
    }
  }

  selectSong(song: Song) {
    this.selectedSong = song;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
