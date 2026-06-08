import { Routes } from '@angular/router';
import { Login } from '../frontend/login/login';
import { Register } from '../frontend/register/register';
import {MenuComponent} from '../frontend/menu/menu';
import {ProfileComponent} from '../frontend/profile/profile';
import {Starterpage} from '../frontend/starterpage/starterpage';
import {Gameplay} from '../frontend/gameplay/gameplay';
import {Messages} from '../frontend/messages/messages';
import { SettingsPage } from '../frontend/settings/settings';
import { AnalyticsPage } from '../frontend/analytics/analytics';
import { AboutPage } from '../frontend/about/about';
import { AchievementsComponent } from '../frontend/achievements/achievements';
import { ChartMaker } from '../frontend/chart-maker/chart-maker';

export const routes: Routes = [
    {path: 'login', component: Login},
    {path: 'register', component: Register},
    {path: 'menu' , component : MenuComponent},
    {path: 'profile', component : ProfileComponent},
    {path: 'profile/:userId', component : ProfileComponent},
    {path: 'achievements', component: AchievementsComponent},
    {path: 'messages', component : Messages},
    {path: 'settings', component: SettingsPage},
    {path: 'analytics', component: AnalyticsPage},
    {path: 'about', component: AboutPage},
    {path: 'starterPage', component: Starterpage},
    {path: 'gameplay', component: Gameplay},
    {path: 'gameplay/:songId', component: Gameplay},
    {path: 'chart-maker', component: ChartMaker},
    {path: '', pathMatch: 'full', redirectTo: 'starterPage'}
];
