import { Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { LoginComponent } from '../login/login.component';
import { AuthService } from '../../app/services/auth.service';

@Component({
  selector: 'app-register',
  imports: [
    NgOptimizedImage,
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register extends LoginComponent {
  override errorMessage = '';
  override loading = false;

  constructor(
    formBuilder: FormBuilder,
    authService: AuthService,
    router: Router
  ) {
    super(formBuilder, authService, router);
  }

  onRegister() {
    this.submitted = true;
    this.errorMessage = '';

    if (this.loginForm.invalid) {
      return;
    }

    this.loading = true;

    const credentials = {
      username: this.f['username'].value,
      password: this.f['password'].value
    };

    this.authService.register(credentials).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          // Redirect to menu on successful registration
          this.router.navigate(['/menu']);
        } else {
          this.errorMessage = response.error || 'Registration failed';
        }
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.message || 'An error occurred during registration';
      }
    });
  }
}
