import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../app/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  imports: [
    ReactiveFormsModule,
    NgOptimizedImage,
    RouterLink
  ],
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loginForm: FormGroup;
  submitted = false;
  protected errorMessage = '';
  protected loading = false;

  constructor(
    protected formBuilder: FormBuilder,
    protected authService: AuthService,
    protected router: Router
  ) {
    this.loginForm = this.formBuilder.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  get f() {
    return this.loginForm.controls;
  }

  onSubmit() {
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

    this.authService.login(credentials).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          // Redirect to menu on successful login
          this.router.navigate(['/menu']);
        } else {
          this.errorMessage = response.error || 'Login failed';
        }
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.message || 'An error occurred during login';
      }
    });
  }

  resetForm() {
    this.submitted = false;
    this.errorMessage = '';
    this.loginForm.reset();
  }
}
