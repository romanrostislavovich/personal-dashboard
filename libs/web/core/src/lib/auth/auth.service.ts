import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AuthConfig,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  PasswordChange,
  ProfileUpdate,
  RegisterRequest,
} from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { applyLanguage } from '../i18n/language';

const TOKEN_KEY = 'pd.accessToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly user = signal<CurrentUser | null>(null);
  readonly isLoggedIn = computed(() => this.token() !== null);

  /** Публичные настройки сервера: доступна ли регистрация. */
  config(): Promise<AuthConfig> {
    return firstValueFrom(this.http.get<AuthConfig>('/api/auth/config'));
  }

  async login(credentials: LoginRequest): Promise<void> {
    this.startSession(
      await firstValueFrom(this.http.post<LoginResponse>('/api/auth/login', credentials)),
    );
  }

  async register(input: RegisterRequest): Promise<void> {
    this.startSession(
      await firstValueFrom(this.http.post<LoginResponse>('/api/auth/register', input)),
    );
  }

  /** Подтягивает профиль по сохранённому токену (при старте приложения). */
  async restoreSession(): Promise<void> {
    if (!this.token()) {
      return;
    }
    try {
      const user = await firstValueFrom(this.http.get<CurrentUser>('/api/auth/me'));
      this.user.set(user);
      applyLanguage(user.locale);
    } catch {
      this.logout();
    }
  }

  async updateProfile(changes: ProfileUpdate): Promise<void> {
    const user = await firstValueFrom(this.http.patch<CurrentUser>('/api/auth/me', changes));
    this.user.set(user);
    applyLanguage(user.locale);
  }

  changePassword(input: PasswordChange): Promise<void> {
    return firstValueFrom(this.http.put<void>('/api/auth/password', input));
  }

  logout(): void {
    this.setToken(null);
    this.user.set(null);
    this.router.navigateByUrl('/login');
  }

  private startSession(response: LoginResponse): void {
    this.setToken(response.accessToken);
    this.user.set(response.user);
    // Язык из профиля: если отличается от текущего, страница перезагрузится.
    applyLanguage(response.user.locale);
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
