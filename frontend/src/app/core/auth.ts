import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { User } from './models';

const STORAGE_KEY = 'makestuff.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  readonly token = signal<string | null>(readToken());
  readonly user = signal<User | null>(null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  async login(username: string, password: string): Promise<void> {
    const res = await firstValueFrom(this.http.post<{ token: string; user: User }>('api/auth/login', { username, password }));
    this.setToken(res.token);
    this.user.set(res.user);
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('api/auth/logout', {})).catch(() => undefined);
    this.clear();
  }

  /** Loads the signed-in user once; false when there is no valid session. */
  async restore(): Promise<boolean> {
    if (this.user()) return true;
    if (!this.token()) return false;
    try {
      const res = await firstValueFrom(this.http.get<{ user: User }>('api/auth/me'));
      this.user.set(res.user);
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    this.setToken(null);
    this.user.set(null);
  }

  private setToken(token: string | null): void {
    this.token.set(token);
    try {
      if (token) localStorage.setItem(STORAGE_KEY, token);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be blocked; the session then lasts until the page closes.
    }
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const token = auth.token();
  const isPlayer = req.headers.has('X-Launch-Token');
  const request = token && !isPlayer ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isPlayer && token) {
        auth.clear();
        router.navigate(['/login']);
      }
      throw error;
    }),
  );
};

export const authGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return (await auth.restore()) || router.createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return auth.isAdmin() || router.createUrlTree(['/library']);
};

/** The message the API sent, or a fallback that makes sense to a person. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (typeof error.error?.error === 'string') return error.error.error;
    if (error.status === 0) return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
