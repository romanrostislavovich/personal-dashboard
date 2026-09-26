import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CurrentUser, LoginRequest, LoginResponse } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';

const TOKEN_KEY = 'pd.accessToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly user = signal<CurrentUser | null>(null);
  readonly isLoggedIn = computed(() => this.token() !== null);

  async login(credentials: LoginRequest): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', credentials),
    );
    this.setToken(response.accessToken);
    this.user.set(response.user);
  }

  /** Подтягивает профиль по сохранённому токену (при старте приложения). */
  async restoreSession(): Promise<void> {
    if (!this.token()) {
      return;
    }
    try {
      this.user.set(await firstValueFrom(this.http.get<CurrentUser>('/api/auth/me')));
    } catch {
      this.logout();
    }
  }

  logout(): void {
    this.setToken(null);
    this.user.set(null);
    this.router.navigateByUrl('/login');
  }

  private setToken(token: string | null): void {
    this.token.set(token);
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }
}
