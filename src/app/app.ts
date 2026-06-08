import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './services/theme.service';
import {Login} from '../frontend/login/login';
import {Register} from '../frontend/register/register';
import {bootstrapApplication} from '@angular/platform-browser';
import {appConfig} from './app.config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('Hit-The-Lights');
  private readonly themeService = inject(ThemeService);
}
