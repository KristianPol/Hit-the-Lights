import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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

    // Override username validators to add max length for registration
    this.loginForm.get('username')?.setValidators([
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(20)
    ]);
    this.loginForm.get('username')?.updateValueAndValidity();

    // Override password validators with stronger requirements for registration
    this.loginForm.get('password')?.setValidators([
      Validators.required,
      Validators.minLength(8),
      Validators.maxLength(128),
      Validators.pattern('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$')
    ]);
    this.loginForm.get('password')?.updateValueAndValidity();
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
