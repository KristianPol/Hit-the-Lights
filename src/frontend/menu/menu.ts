import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
  audioFile?: File;
  coverFile?: File;
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
  isLoading = true;

  selectedSong: Song | null = null;

  showAddTrackForm = false;
  pendingSong: AddSongFormData = {};

  constructor(
    private authService: AuthService,
    private songService: SongService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.currentUser = this.authService.currentUser;
    this.audio = new Audio();
    this.audio.volume = 1;
  }

  ngOnInit() {
    setTimeout(() => {
      this.loadSongsFromDatabase();
    }, 0);
  }

  loadSongsFromDatabase() {
    console.log('🎵 MenuComponent: Starting to load songs from database');
    this.isLoading = true;
    this.loadingError = null;

    this.songService.getAllSongs().subscribe({
      next: response => {
        console.log('✅ MenuComponent: Received response from getAllSongs()', response);
        if (response.success) {
          console.log(`📦 MenuComponent: Successfully loaded ${response.songs.length} songs`);
          this.songs = response.songs;
          this.loadingError = null;
          this.isLoading = false;
          console.log('🎶 MenuComponent: Songs array updated', this.songs);
          this.cdr.detectChanges();
        } else {
          console.error('❌ MenuComponent: API returned success=false', response.error);
          this.loadingError = response.error || 'Failed to load songs';
          this.songs = [];
          this.isLoading = false;
        }
      },
      error: error => {
        console.error('❌ MenuComponent: Error loading songs', error);
        this.loadingError = `Error loading songs: ${error.message}`;
        this.songs = [];
        this.isLoading = false;
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
      this.pendingSong.audioFile = input.files[0];
    }
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.pendingSong.coverFile = input.files[0];
    }
  }

  submitTrack(): void {
    const { name, author, bpm, audioFile, coverFile } = this.pendingSong;

    if (!name || !author || !bpm || !audioFile || !coverFile) {
      alert('Please fill in all fields.');
      return;
    }

    Promise.all([
      this.getAudioDuration(audioFile),
      this.fileToBase64(audioFile),
      this.fileToBase64(coverFile)
    ])
      .then(([length, audioBase64, coverBase64]) => {
        this.songService.addSong({
          name,
          author,
          bpm: parseInt(bpm.toString(), 10),
          length,
          audioBase64,
          audioMimeType: audioFile.type,
          coverBase64,
          coverMimeType: coverFile.type
        }).subscribe({
          next: response => {
            if (response.success) {
              this.songs.push({
                id: response.songId || this.songs.length + 1,
                name,
                author,
                bpm: parseInt(bpm.toString(), 10),
                length,
                songUrl: response.songUrl ?? '',
                coverUrl: response.coverUrl ?? ''
              });
              this.loadSongsFromDatabase();
              this.closeAddTrackForm();
            } else {
              alert(`Failed to add song: ${response.error}`);
            }
          },
          error: err => alert(`Error adding song: ${err.message}`)
        });
      })
      .catch(err => alert(`Failed to process files: ${err}`));
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = () => reject('Failed to read file');
      reader.readAsDataURL(file);
    });
  }

  private getAudioDuration(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      let durationSet = false;

      const timeout = setTimeout(() => {
        if (!durationSet) {
          audio.pause();
          URL.revokeObjectURL(url);
          reject('Timeout: Could not load audio duration');
        }
      }, 5000);

      audio.onloadedmetadata = () => {
        if (audio.duration && audio.duration !== Infinity) {
          durationSet = true;
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(this.formatDuration(audio.duration));
        }
      };

      audio.oncanplay = () => {
        if (!durationSet && audio.duration && audio.duration !== Infinity) {
          durationSet = true;
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(this.formatDuration(audio.duration));
        }
      };

      audio.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject('Failed to load audio file');
      };

      audio.src = url;
      audio.load();
    });
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
