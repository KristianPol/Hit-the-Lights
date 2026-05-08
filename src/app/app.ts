import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {Login} from '../frontend/login/login';
import {Register} from '../frontend/register/register';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('Hit-The-Lights');
}
