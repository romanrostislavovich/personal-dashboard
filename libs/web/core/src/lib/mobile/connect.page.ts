import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { mobileReadCache } from './idb-read-cache';
import { mobileServer, normalizeServer, setMobileServer } from './mobile-app';

/** How long to wait for a server that does not answer. */
const CHECK_TIMEOUT_MS = 10_000;

/**
 * The first page of the Android app: which server it talks to. The address is checked (the
 * server's health check answers) before it is kept; then the app starts over with it, so every
 * request goes there.
 */
@Component({
  selector: 'pd-connect-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, TranslocoPipe],
  template: `
    <mat-card class="card" appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'core.mobile.connect.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="hint">{{ 'core.mobile.connect.hint' | transloco }}</p>
        <form (submit)="$event.preventDefault(); connect()">
          <mat-form-field>
            <mat-label>{{ 'core.mobile.connect.address' | transloco }}</mat-label>
            <input
              matInput
              name="server"
              inputmode="url"
              autocapitalize="off"
              autocomplete="url"
              placeholder="dashboard.example.com"
              [value]="address()"
              (input)="address.set($any($event.target).value)"
            />
          </mat-form-field>
          @if (error(); as key) {
            <p class="error" role="alert">{{ key | transloco }}</p>
          }
          <button matButton="filled" type="submit" [disabled]="!address().trim() || checking()">
            {{
              (checking() ? 'core.mobile.connect.checking' : 'core.mobile.connect.submit')
                | transloco
            }}
          </button>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 16px;
      box-sizing: border-box;
    }
    .card {
      width: min(400px, 100%);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0 0 8px;
    }
  `,
})
export class ConnectPage {
  readonly address = signal(mobileServer() ?? '');
  readonly checking = signal(false);
  /** The translation key of the error to show. */
  readonly error = signal<string | null>(null);

  async connect(): Promise<void> {
    const server = normalizeServer(this.address());
    if (!server) {
      this.error.set('core.mobile.connect.invalid');
      return;
    }
    this.checking.set(true);
    this.error.set(null);
    try {
      const response = await fetch(`${server}/api/health`, {
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (server !== mobileServer()) {
        // What was read came from the other server's account.
        await mobileReadCache().clear();
      }
      setMobileServer(server);
      // The client core and its session are made once, for one server: start over with it.
      location.replace('/login');
    } catch {
      this.error.set('core.mobile.connect.unreachable');
      this.checking.set(false);
    }
  }
}
