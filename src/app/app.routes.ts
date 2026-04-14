import { Routes } from '@angular/router';
import { LoginComponent } from '../frontend/login/login.component';
import { Register } from '../frontend/register/register';
import {MenuComponent} from '../frontend/menu/menu';
import {ProfileComponent} from '../frontend/profile/profile';
import {Starterpage} from '../frontend/starterpage/starterpage';
import {GameplayComponent} from '../frontend/gameplay/gameplay.component';

export const routes: Routes = [
    {path: 'login', component: LoginComponent},
    {path: 'register', component: Register},
    {path: 'menu' , component : MenuComponent},
    {path: 'profile', component : ProfileComponent},
    {path: 'starterPage', component: Starterpage},
    {path: 'gameplay', component: GameplayComponent},
    {path: 'gameplay/:songId', component: GameplayComponent},
    {path: '', pathMatch: 'full', redirectTo: 'starterPage'}
];
