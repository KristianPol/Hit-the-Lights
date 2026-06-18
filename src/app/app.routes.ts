import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { Login } from '../frontend/login/login';
import { Register } from '../frontend/register/register';
import { MenuPageComponent } from '../frontend/menu/menu-page/menu-page.component';
import { SongListComponent } from '../frontend/menu/song-list/song-list.component';
import { SongDetailComponent } from '../frontend/menu/song-detail/song-detail.component';
import {ProfileComponent} from '../frontend/profile/profile';
import {Starterpage} from '../frontend/starterpage/starterpage';
import {Gameplay} from '../frontend/gameplay/gameplay';
import {Messages} from '../frontend/messages/messages';
import { SettingsPage } from '../frontend/settings/settings';
import { AnalyticsPage } from '../frontend/analytics/analytics';
import { AboutPage } from '../frontend/about/about';
import { PatchNotesPage } from '../frontend/about/patch-notes/patch-notes';
import { AchievementsComponent } from '../frontend/achievements/achievements';
import { ChartMaker } from '../frontend/chart-maker/chart-maker';
import { LeaderboardPage } from '../frontend/leaderboard/leaderboard';
import { HomePage } from '../frontend/home/home';
import { AuthService } from './services/auth.service';

export const routes: Routes = [
    {path: 'login', component: Login},
    {path: 'register', component: Register},
    {
        path: 'menu',
        component: MenuPageComponent,
        children: [
            { path: '', component: SongListComponent },
            { path: 'home', component: HomePage },
            { path: 'song/:songId', component: SongDetailComponent }
        ]
    },
    {path: 'profile', component : ProfileComponent},
    {path: 'profile/:userId', component : ProfileComponent},
    {path: 'achievements', component: AchievementsComponent},
    {path: 'messages', component : Messages},
    {path: 'settings', component: SettingsPage},
    {path: 'analytics', component: AnalyticsPage},
    {path: 'about/patch-notes', component: PatchNotesPage},
    {path: 'about', component: AboutPage},
    {path: 'starterPage', component: Starterpage},
    {path: 'gameplay', component: Gameplay},
    {path: 'gameplay/:songId', component: Gameplay},
    {path: 'chart-maker', component: ChartMaker},
    {path: 'leaderboard', component: LeaderboardPage},
    {
        path: '',
        pathMatch: 'full',
        redirectTo: () => {
            const authService = inject(AuthService);
            return authService.isLoggedIn ? 'menu/home' : 'starterPage';
        }
    }
];
