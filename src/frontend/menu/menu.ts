import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../app/services/auth.service';
import { SongService } from '../../app/services/song.service';

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
  coverUrl: string;
  songUrl: string;
}

interface AddSongFormData {
  name?: string;
  author?: string;
  bpm?: number;
  audioUrl?: string;
  cover?: string;
}

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './menu.html',
  styleUrls: ['./menu.scss']
})
export class MenuComponent implements OnInit, OnDestroy {
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

  songs: Song[] = [];
  loadingError: string | null = null;

  selectedSong: Song | null = null;

  // Add Track Form
  showAddTrackForm = false;
  pendingSong: AddSongFormData = {};

  constructor(
    private authService: AuthService,
    private songService: SongService,
    private router: Router
  ) {
    this.currentUser = this.authService.currentUser;
    this.audio = new Audio();
    this.audio.volume = 1;
  }

  ngOnInit() {
    this.loadSongsFromDatabase();
  }

  private loadSongsFromDatabase() {
    this.songService.getAllSongs().subscribe({
      next: response => {
        if (response.success) {
          this.songs = response.songs;
          this.loadingError = null;
        } else {
          this.loadingError = response.error || 'Failed to load songs';
          this.songs = [];
        }
      },
      error: error => {
        this.loadingError = `Error loading songs: ${error.message}`;
        this.songs = [];
        console.error('Failed to load songs from database:', error);
      }
    });
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
    this.playSong(this.selectedSong.songUrl).then(() => "Audio played");
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
    this.pendingSong = {};
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.pendingSong.audioUrl = URL.createObjectURL(input.files[0]);
    }
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.pendingSong.cover = URL.createObjectURL(input.files[0]);
    }
  }

  submitTrack(): void {
    const { name, author, bpm, audioUrl, cover } = this.pendingSong;

    if (!name || !author || !bpm || !audioUrl || !cover) {
      alert('Please fill in all fields.');
      return;
    }

    // Calculate song length from audio metadata
    this.getAudioDuration(audioUrl)
      .then(length => {
        // Call backend API to save song to database
        this.songService
          .addSong({
            name,
            author,
            bpm: parseInt(bpm.toString(), 10),
            length,
            songUrl: audioUrl,
            coverUrl: cover
          })
          .subscribe({
            next: response => {
              if (response.success) {
                // Add to local array after successful database insert
                this.songs.push({
                  id: response.songId || this.songs.length + 1,
                  name,
                  author,
                  bpm: parseInt(bpm.toString(), 10),
                  length,
                  songUrl: audioUrl,
                  coverUrl: cover
                });
                this.closeAddTrackForm();
                alert('Song added successfully!');
              } else {
                alert(`Failed to add song: ${response.error}`);
              }
            },
            error: error => {
              alert(`Error adding song: ${error.message}`);
            }
          });
      })
      .catch(error => {
        alert(`Failed to load audio file: ${error}`);
      });
  }

  private getAudioDuration(audioUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      let durationSet = false;
      const timeout = setTimeout(() => {
        if (!durationSet) {
          audio.pause();
          reject('Timeout: Could not load audio duration');
        }
      }, 5000); // 5 second timeout

      audio.onloadedmetadata = () => {
        if (audio.duration && audio.duration !== Infinity) {
          durationSet = true;
          clearTimeout(timeout);
          const length = this.formatDuration(audio.duration);
          resolve(length);
        }
      };

      audio.oncanplay = () => {
        if (!durationSet && audio.duration && audio.duration !== Infinity) {
          durationSet = true;
          clearTimeout(timeout);
          const length = this.formatDuration(audio.duration);
          resolve(length);
        }
      };

      audio.onerror = () => {
        clearTimeout(timeout);
        reject('Failed to load audio file');
      };

      audio.src = audioUrl;
      audio.load();
    });
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
