import { Routes } from '@angular/router';
import { LoginComponent } from '../frontend/login/login.component';
import { Register } from '../frontend/register/register';
import {MenuComponent} from '../frontend/menu/menu';

export const routes: Routes = [
    {path: '', redirectTo: 'login', pathMatch: 'full'},
    {path: 'login', component: LoginComponent},
    {path: 'register', component: Register},
    {path: 'menu' , component : MenuComponent}
];
