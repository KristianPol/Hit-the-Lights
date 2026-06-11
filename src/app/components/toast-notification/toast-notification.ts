import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-toast-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-notification.html',
  styleUrl: './toast-notification.scss'
})
export class ToastNotificationComponent {
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  toasts = this.notificationService.toasts;

  dismiss(id: number): void {
    this.notificationService.dismissToast(id);
  }

  onToastClick(toast: { id: number; senderId?: number }): void {
    if (toast.senderId) {
      this.dismiss(toast.id);
      this.router.navigate(['/messages'], {
        state: { openChatWith: toast.senderId }
      });
    }
  }

  getIconClass(type: string): string {
    switch (type) {
      case 'success': return 'fa-check-circle';
      case 'error': return 'fa-exclamation-circle';
      case 'message': return 'fa-comment-dots';
      default: return 'fa-info-circle';
    }
  }
}
