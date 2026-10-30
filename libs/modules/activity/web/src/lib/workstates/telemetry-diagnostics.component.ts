import {DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {RouterLink} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {DesktopTelemetryDiagnostics} from '@pd/contracts';

/**
 * Why the digital telemetry of this computer is on or off, and what to do about it — read from
 * the desktop app on request. Only what the app saw since it started: no tokens, window titles,
 * commands or paths.
 */
@Component({
  selector: 'pd-telemetry-diagnostics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, RouterLink, TranslocoPipe],
  template: `
    @if (diagnostics(); as d) {
      <section aria-labelledby="telemetry-diagnostics-title">
        <h4 id="telemetry-diagnostics-title">
          {{ 'activity.diagnostics.title' | transloco }}
        </h4>
        <p>
          {{ 'activity.diagnostics.collection.' + d.collection | transloco }}
        </p>
        @if (!d.telemetryConsent && d.smartBreakConsent) {
          <p>{{ 'activity.diagnostics.breaksNeedTelemetry' | transloco }}</p>
        }
        @if (d.collection === 'unregistered' || d.collection === 'stopped') {
          <a matButton routerLink="/activity/settings">{{
            'activity.setup.open' | transloco
          }}</a>
        }
        <details>
          <summary>{{ 'activity.diagnostics.details' | transloco }}</summary>
          <dl>
            <dt>{{ 'activity.diagnostics.device' | transloco }}</dt>
            <dd>
              {{
                d.deviceId ?? ('activity.diagnostics.notRegistered' | transloco)
              }}
            </dd>
            <dt>{{ 'activity.diagnostics.version' | transloco }}</dt>
            <dd>
              {{
                d.version ?? ('activity.diagnostics.sourceBuild' | transloco)
              }}
            </dd>
            <dt>{{ 'activity.diagnostics.registration' | transloco }}</dt>
            <dd>
              {{
                'activity.diagnostics.' + (d.registered ? 'yes' : 'no')
                  | transloco
              }}
            </dd>
            <dt>{{ 'activity.diagnostics.server' | transloco }}</dt>
            <dd>
              {{
                'activity.diagnostics.' + (d.serverConfigured ? 'yes' : 'no')
                  | transloco
              }}
            </dd>
            <dt>{{ 'activity.digital.telemetry' | transloco }}</dt>
            <dd>
              {{
                'activity.diagnostics.' + (d.telemetryConsent ? 'yes' : 'no')
                  | transloco
              }}
            </dd>
            <dt>{{ 'activity.digital.smartBreak' | transloco }}</dt>
            <dd>
              {{
                'activity.diagnostics.' + (d.smartBreakConsent ? 'yes' : 'no')
                  | transloco
              }}
            </dd>
            <dt>{{ 'activity.diagnostics.nativeSources' | transloco }}</dt>
            <dd>
              {{ 'activity.diagnostics.sources.' + d.sources | transloco }}
            </dd>
            <dt>{{ 'activity.diagnostics.deliveryTitle' | transloco }}</dt>
            <dd>
              {{ 'activity.diagnostics.delivery.' + d.delivery | transloco }}
            </dd>
            <dt>{{ 'activity.diagnostics.pending' | transloco }}</dt>
            <dd>{{ d.pendingBuckets }}</dd>
            <dt>{{ 'activity.diagnostics.lastAttempt' | transloco }}</dt>
            <dd>
              {{
                (d.lastAttemptAt | date: 'medium') ??
                  ('activity.diagnostics.notObserved' | transloco)
              }}
            </dd>
            <dt>{{ 'activity.diagnostics.lastSuccess' | transloco }}</dt>
            <dd>
              {{
                (d.lastSuccessAt | date: 'medium') ??
                  ('activity.diagnostics.notObserved' | transloco)
              }}
            </dd>
            <dt>{{ 'activity.diagnostics.httpStatus' | transloco }}</dt>
            <dd>
              {{
                d.lastHttpStatus ??
                  ('activity.diagnostics.noResponse' | transloco)
              }}
            </dd>
          </dl>
          <p>{{ 'activity.diagnostics.sessionOnly' | transloco }}</p>
          <h4>{{ 'activity.diagnostics.capabilities' | transloco }}</h4>
          <ul>
            <li>{{ 'activity.diagnostics.windows' | transloco }}</li>
            <li>{{ 'activity.diagnostics.input' | transloco }}</li>
            <li>{{ 'activity.diagnostics.terminal' | transloco }}</li>
            <li>{{ 'activity.diagnostics.browser' | transloco }}</li>
          </ul>
        </details>
      </section>
    }
  `,
  styles: `
    section {
      margin-block: 16px;
    }
    summary {
      cursor: pointer;
    }
    dl {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 8px 16px;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    @media (max-width: 600px) {
      dl {
        grid-template-columns: 1fr;
      }
      dd {
        margin-bottom: 8px;
      }
    }
  `,
})
export class TelemetryDiagnosticsComponent {
  readonly diagnostics = input<DesktopTelemetryDiagnostics | null>(null);
}
