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
  /**
   * The app was opened without a connection: the user is the one last signed in on this device,
   * there is no access token, pages show what the service worker has saved and changes wait in
   * the outbox (see OfflineService).
   */
  readonly offline = signal(false);
  readonly isLoggedIn = computed(() => this.token() !== null || this.offline());

  constructor() {
    const unsubscribe = this.client.session.subscribe((token) => {
      this.token.set(token);
      if (token !== null) {
        this.offline.set(false);
      } else {
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

  /** A demo instance: in as the shared demo user, without an account. */
  async tryDemo(): Promise<void> {
    this.signedIn(await this.client.tryDemo());
  }

  /** A new access token after a 401 from `HttpClient`; `null` — the session is over. */
  async refreshToken(): Promise<string | null> {
    // `undefined` — no answer (still offline); `null` — the server ended the session.
    const result = await this.client.api.refresh().catch(() => undefined);
    if (result === null && this.offline()) {
      this.leaveOffline();
    }
    return result?.accessToken ?? null;
  }

  /** The connection may be back: turns an offline start into a real session. */
  async reconnect(): Promise<void> {
    if (this.offline()) {
      const result = await this.client.api.refresh().catch(() => undefined);
      if (result) {
        this.signedIn(result.user);
      } else if (result === null) {
        this.leaveOffline();
      }
    }
  }

  /** Loads the profile using the saved token (on app start). */
  async restoreSession(): Promise<void> {
    const user = await this.client.restoreSession();
    if (user) {
      this.signedIn(user);
      return;
    }
    // No connection, but this device was signed in: open with what is saved.
    const remembered = await this.client.offlineUser();
    if (remembered) {
      this.user.set(remembered);
      this.offline.set(true);
    }
  }

  async updateProfile(changes: ProfileUpdate): Promise<void> {
    this.signedIn(await this.client.auth.updateProfile(changes));
  }

  changePassword(input: PasswordChange): Promise<void> {
    return this.client.auth.changePassword(input);
  }

  logout(): void {
    if (this.offline()) {
      // There is no session to end: its change would not be noticed (see the constructor).
      this.leaveOffline();
    }
    void forgetSavedData();
    void this.client.signOut();
  }

  private leaveOffline(): void {
    this.offline.set(false);
    this.user.set(null);
    void this.router.navigateByUrl('/login');
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

/**
 * The answers the service worker saved for offline use belong to the user who signed out:
 * the next one must not see them.
 */
async function forgetSavedData(): Promise<void> {
  try {
    const names = await globalThis.caches?.keys();
    await Promise.all(
      (names ?? []).filter((name) => name.includes(':data:')).map((name) => caches.delete(name)),
    );
  } catch {
    // No cache storage (an old browser, a private window): nothing was saved.
  }
}
