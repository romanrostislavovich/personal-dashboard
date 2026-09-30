import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AuthConfig,
  CurrentUser,
  LoginRequest,
  PasswordChange,
  ProfileUpdate,
  RegisterRequest,
} from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { applyLanguage } from '../i18n/language';

/**
 * The signed-in user for Angular: signals over the session of the client core. Whoever ends the
 * session — sign-out, a 401 from any request — lands on the sign-in page.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = inject(DASHBOARD_CLIENT);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(this.client.session.token);
  readonly user = signal<CurrentUser | null>(null);
  readonly isLoggedIn = computed(() => this.token() !== null);

  constructor() {
    const unsubscribe = this.client.session.subscribe((token) => {
      this.token.set(token);
      if (token === null) {
        this.user.set(null);
        void this.router.navigateByUrl('/login');
      }
    });
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  /** Public server settings: whether sign-up is available. */
  config(): Promise<AuthConfig> {
    return this.client.auth.config();
  }

  async login(credentials: LoginRequest): Promise<void> {
    this.signedIn(await this.client.signIn(credentials));
  }

  async register(input: RegisterRequest): Promise<void> {
    this.signedIn(await this.client.signUp(input));
  }

  /** Loads the profile using the saved token (on app start). */
  async restoreSession(): Promise<void> {
    const user = await this.client.restoreSession();
    if (user) {
      this.signedIn(user);
    }
  }

  async updateProfile(changes: ProfileUpdate): Promise<void> {
    this.signedIn(await this.client.auth.updateProfile(changes));
  }

  changePassword(input: PasswordChange): Promise<void> {
    return this.client.auth.changePassword(input);
  }

  logout(): void {
    void this.client.signOut();
  }

  private signedIn(user: CurrentUser): void {
    this.user.set(user);
    // Language from the profile: if it differs from the current one, the page reloads.
    applyLanguage(user.locale);
  }
}
