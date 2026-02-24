import { Component } from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {NgOptimizedImage} from '@angular/common';
import {RouterLink } from '@angular/router';

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

  constructor(protected formBuilder: FormBuilder) {
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

    if (this.loginForm.invalid) {
      return;
    }

    //TODO Handle login logic here
    const credentials = {
      username: this.f['username'].value,
      password: this.f['password'].value
    };

    console.log('Login credentials:', credentials);
    // TODO Implement auth. services
  }

  resetForm() {
    this.submitted = false;
    this.loginForm.reset();
  }
}
