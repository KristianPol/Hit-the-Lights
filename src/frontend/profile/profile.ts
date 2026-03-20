import { Component, OnInit, NgZone } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../app/services/auth.service';
import { Observable, catchError, of, tap, finalize } from 'rxjs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [RouterModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  loading = true;
  error: string | null = null;

  // Edit profile modal state
  showEditModal = false;
  selectedProfilePicture: File | null = null;
  profilePicturePreview: string | null = null;
  updatingProfilePicture = false;
  updateError: string | null = null;
  updateSuccess = false;
  imageError = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.error = null;

    this.authService.currentUser$.pipe(
      tap(user => {
        console.log('ProfileComponent: User updated:', user);
        this.ngZone.run(() => {
          this.user = user;
          this.imageError = false; // Reset image error when user updates
          this.loading = false;
        });
      }),
      catchError(err => {
        this.ngZone.run(() => {
          this.error = 'Failed to load profile';
          this.loading = false;
        });
        return of(null);
      }),
      finalize(() => {
        this.ngZone.run(() => {
          this.loading = false;
        });
      })
    ).subscribe();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  editProfile(): void {
    this.showEditModal = true;
    this.selectedProfilePicture = null;
    this.profilePicturePreview = null;
    this.updateError = null;
    this.updateSuccess = false;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedProfilePicture = null;
    this.profilePicturePreview = null;
    this.updateError = null;
    this.updateSuccess = false;
  }

  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        this.updateError = 'Profile picture must be less than 5MB';
        this.selectedProfilePicture = null;
        this.profilePicturePreview = null;
        return;
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        this.updateError = 'Please select a valid image file (JPEG, PNG, GIF, or WebP)';
        this.selectedProfilePicture = null;
        this.profilePicturePreview = null;
        return;
      }

      this.selectedProfilePicture = file;
      this.updateError = null;

      // Create preview
      const reader = new FileReader();
      reader.onload = () => {
        this.profilePicturePreview = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

    updateProfilePicture(): void {
      if (!this.selectedProfilePicture || !this.user) {
        return;
      }

      this.updatingProfilePicture = true;
      this.updateError = null;
      this.updateSuccess = false;

      // Convert file to base64
      this.fileToBase64(this.selectedProfilePicture)
        .then(base64 => {
          this.authService.updateProfilePicture(this.user!.id, base64).subscribe({
            next: response => {
              console.log('Profile picture update response:', response);
              this.ngZone.run(() => {
                this.updatingProfilePicture = false;
                if (response.success) {
                  this.updateSuccess = true;
                  console.log('Current user after update:', this.authService.currentUser);
                  // Close modal immediately when PFP added successfully
                  this.closeEditModal();
                } else {
                  this.updateError = response.error || 'Failed to update profile picture';
                }
              });
            },
            error: err => {
              console.error('Profile picture update error:', err);
              this.ngZone.run(() => {
                this.updatingProfilePicture = false;
                this.updateError = err.message || 'Failed to update profile picture';
              });
            }
          });
        })
        .catch(err => {
          this.ngZone.run(() => {
            this.updatingProfilePicture = false;
            this.updateError = 'Failed to read image file';
          });
        });
    }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix, keep only base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject('Failed to read file');
      reader.readAsDataURL(file);
    });
  }

  onImageError(): void {
    console.error('Failed to load profile picture image');
    this.imageError = true;
  }

  retry(): void {
    this.ngOnInit();
  }
}
