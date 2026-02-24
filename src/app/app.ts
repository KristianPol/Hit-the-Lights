import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {LoginComponent} from '../frontend/login/login.component';

@Component({
  selector: 'app-root',
  imports: [LoginComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('Hit-The-Lights');
}
