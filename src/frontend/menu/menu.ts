import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../app/services/auth.service';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
  isAction?: boolean;
}

interface Song {
  id: number;
  name: string;
  author: string;
  length: string;
  bpm: number;
  cover: string;
  audioUrl: string;
}

interface NewTrack {
  name: string;
  author: string;
  bpm: number | null;
  file: File | null;
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './menu.html',
  styleUrls: ['./menu.scss']
})
export class MenuComponent implements OnDestroy {
  menuItems: MenuItem[] = [
    { label: 'Dashboard', icon: '◆', route: '/dashboard' },
    { label: 'Profile', icon: '◎', route: '/profile' },
    { label: 'Settings', icon: '⚙', route: '/settings' },
    { label: 'Messages', icon: '✉', route: '/messages', badge: 3 },
    { label: 'Analytics', icon: '◈', route: '/analytics' },
    { label: 'Logout', icon: '→', route: '/logout', isAction: true }
  ];

  activeItem = 'Dashboard';
  currentUser: User | null = null;
  private audio = new Audio();

  songs: Song[] = [
    {
      id: 1,
      name: 'Parabola',
      author: 'TOOL',
      length: '6:03',
      bpm: 79,
      cover: 'assets/images/parabola.jpg',
      audioUrl: 'assets/music/Parabola.mp3'
    },
    {
      id: 2,
      name: '505',
      author: 'Arctic Monkeys',
      length: '4:14',
      bpm: 140,
      cover: 'assets/images/505.jpg',
      audioUrl: 'assets/music/505.mp3'
    },
    {
      id: 3,
      name: 'Full Moon Full Life',
      author: 'Atlas Sound Team',
      length: '4:54',
      bpm: 192,
      cover: 'assets/images/p3.jpg',
      audioUrl: 'assets/music/FullMoonFullLife.mp3'
    }
  ];

  selectedSong: Song | null = null;

  // Add Track Form
  showAddTrackForm = false;
  newTrack: NewTrack = {
    name: '',
    author: '',
    bpm: null,
    file: null,
  };

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    this.currentUser = this.authService.currentUser;
    this.audio = new Audio();
    this.audio.volume = 1;
  }

  ngOnDestroy() {
    this.stopAudio();
  }

  private stopAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
    }
  }

  setActive(item: string) {
    this.activeItem = item;
    if (item === 'Logout') {
      this.logout();
    }
  }

  selectSong(song: Song) {
    this.selectedSong = song;
    this.playSong(this.selectedSong.audioUrl).then(r => "Audio played");
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  async playSong(url: string) {
    try {
      this.stopAudio();

      if (!this.audio) {
        this.audio = new Audio();
        this.audio.volume = 1;
      }

      this.audio.src = url;

      await new Promise((resolve, reject) => {
        this.audio!.onloadedmetadata = resolve;
        this.audio!.onerror = reject;
        this.audio!.load();
      });

      await this.audio.play();
    } catch (error) {
      console.error('Playback failed:', error);
      if (error instanceof DOMException && error.name === 'NotSupportedError') {
        alert('Audio format not supported or file not found');
      }
    }
  }

  navigateToProfile() {
    this.router.navigate(['/profile']);
    this.activeItem = 'Profile';
  }

  // Add Track Methods
  openAddTrackForm(): void {
    this.showAddTrackForm = true;
  }

  closeAddTrackForm(): void {
    this.showAddTrackForm = false;
    this.resetNewTrack();
  }

  private resetNewTrack(): void {
    this.newTrack = { name: '', author: '', bpm: null, file: null };
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.newTrack.file = input.files[0];
    }
  }

  submitTrack(): void {
    if (!this.newTrack.name || !this.newTrack.author || !this.newTrack.bpm || !this.newTrack.file) {
      alert('Please fill in all fields.');
      return;
    }

    const audioUrl = URL.createObjectURL(this.newTrack.file);

    const newSong: Song = {
      id: this.songs.length + 1,
      name: this.newTrack.name,
      author: this.newTrack.author,
      length: '0:00',
      bpm: this.newTrack.bpm,
      cover: 'assets/images/default.jpg',
      audioUrl
    };

    this.songs.push(newSong);
    this.closeAddTrackForm();
  }
}
