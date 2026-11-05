import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.Login) },
  { path: 'forgot-password', loadComponent: () => import('./pages/forgot-password').then((m) => m.ForgotPassword) },
  { path: 'reset-password/:token', loadComponent: () => import('./pages/reset-password').then((m) => m.ResetPassword) },

  // Runs inside an LMS iframe, without the authoring shell or a sign-in.
  { path: 'play/:token', loadComponent: () => import('./player/player-page').then((m) => m.PlayerPage) },
  { path: 'pick/:token', loadComponent: () => import('./pages/pick').then((m) => m.Pick) },

  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'library' },
      { path: 'library', loadComponent: () => import('./pages/library').then((m) => m.Library) },
      { path: 'items/:id', loadComponent: () => import('./pages/item').then((m) => m.Item) },
      { path: 'account', loadComponent: () => import('./pages/account').then((m) => m.Account) },
      { path: 'users', canActivate: [adminGuard], loadComponent: () => import('./pages/users').then((m) => m.Users) },
      { path: 'connections', canActivate: [adminGuard], loadComponent: () => import('./pages/connections').then((m) => m.Connections) },
    ],
  },
  { path: '**', redirectTo: '' },
];
