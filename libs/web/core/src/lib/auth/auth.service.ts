import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AuthConfig,
  CurrentUser,
  LoginRequest,
  PasswordChange,
  ProfileUpdate,
  RegisterRequest,
  deviceTimeZone,
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

  /** The password step; `challengeToken` — a code from the authenticator app is needed. */
  async login(credentials: Omit<LoginRequest, 'client'>): Promise<{ challengeToken?: string }> {
    const result = await this.client.signIn(credentials);
    if (result.status === 'code-required') {
      return { challengeToken: result.challengeToken };
    }
    this.signedIn(result.user);
    return {};
  }

  /** The second step of signing in with two-factor sign-in on. */
  async completeLogin(challengeToken: string, code: string): Promise<void> {
    this.signedIn(await this.client.completeSignIn(challengeToken, code));
  }

  async register(input: Omit<RegisterRequest, 'client'>): Promise<void> {
    this.signedIn(await this.client.signUp(input));
  }

  /** A new access token after a 401 from `HttpClient`; `null` — the session is over. */
  async refreshToken(): Promise<string | null> {
    return (await this.client.api.refresh().catch(() => null))?.accessToken ?? null;
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
    this.rememberTimeZone(user);
  }

  /**
   * Tells the server the zone of this device when it differs from the saved one: reminders and
   * the digest follow the clock of the device the user opened last — a laptop, a phone.
   */
  private rememberTimeZone(user: CurrentUser): void {
    const timeZone = deviceTimeZone();
    if (timeZone && timeZone !== user.timeZone) {
      void this.client.auth
        .updateProfile({ timeZone })
        .then((updated) => this.user.set(updated))
        // Not worth an error on screen: the next opening tries again.
        .catch(() => undefined);
    }
  }
}
