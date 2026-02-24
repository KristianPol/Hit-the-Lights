import { Component } from '@angular/core';
import {NgOptimizedImage} from '@angular/common';
import {LoginComponent} from '../login/login.component';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import { RouterLink } from '@angular/router';

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
export class Register extends LoginComponent{
  constructor(formBuilder: FormBuilder) {
    super(formBuilder);
  }

  onRegister(){
    this.submitted = true;

    if(this.loginForm.invalid){
      return;
    }

    // TODO handle database insert here
    const credentials = {
      username: this.f['username'].value,
      password: this.f['password'].value
    };

  }
}
