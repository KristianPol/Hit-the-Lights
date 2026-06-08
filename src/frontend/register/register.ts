import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { Login } from '../login/login';
import { AuthService } from '../../app/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register extends Login {
  constructor(
    formBuilder: FormBuilder,
    authService: AuthService,
    router: Router
  ) {
    super(formBuilder, authService, router);
  }

  onRegister() {
    this.submitted.set(true);
    this.errorMessage.set('');

    if (this.loginForm.invalid) {
      return;
    }

    this.loading.set(true);

    const credentials = {
      username: this.f['username'].value,
      password: this.f['password'].value
    };

    this.authService.register(credentials).subscribe({
      next: (response) => {
        this.loading.set(false);
        if (response.success) {
          // Redirect to menu on successful registration
          this.router.navigate(['/menu']);
        } else {
          this.errorMessage.set(response.error || 'Registration failed');
        }
      },
      error: (error) => {
        this.loading.set(false);
        this.errorMessage.set(error.message || 'An error occurred during registration');
      }
    });
  }
}
