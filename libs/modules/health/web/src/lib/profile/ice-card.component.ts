import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {EmergencyContact, HealthRecord} from '@pd/contracts';
import {AuthService} from '@pd/web-core';
import QRCode from 'qrcode';
import {HealthApi} from '../health.api';
import {today} from '../health-labels';
import {iceLines, IceWords} from './ice-card';

/** A phone's lock screen, tall: the clock keeps the top, the card is below. */
const SCREEN = {width: 1170, height: 2532};

/**
 * The ICE card of the profile: whom to call in an emergency, and the card itself — to print
 * for the wallet, or as a picture for the phone's lock screen with a QR code a paramedic's
 * camera reads (plain text: no app, no network needed).
 */
@Component({
  selector: 'pd-health-ice-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <section class="ice">
      <h2>🆘 {{ 'health.ice.title' | transloco }}</h2>
      <p class="hint">{{ 'health.ice.hint' | transloco }}</p>

      <h3>{{ 'health.ice.contacts' | transloco }}</h3>
      @for (contact of contacts(); track $index; let i = $index) {
        <div class="contact">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'health.ice.name' | transloco }}</mat-label>
            <input
              matInput
              maxlength="100"
              [value]="contact.name"
              (input)="change(i, 'name', $event)"
            />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'health.ice.phone' | transloco }}</mat-label>
            <input
              matInput
              type="tel"
              maxlength="40"
              [value]="contact.phone"
              (input)="change(i, 'phone', $event)"
            />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'health.ice.relation' | transloco }}</mat-label>
            <input
              matInput
              maxlength="50"
              [value]="contact.relation"
              (input)="change(i, 'relation', $event)"
            />
          </mat-form-field>
          <button
            matIconButton
            [attr.aria-label]="'core.actions.delete' | transloco"
            (click)="removeContact(i)"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
      <div class="actions">
        @if (contacts().length < 5) {
          <button matButton (click)="addContact()">
            <mat-icon>person_add</mat-icon>
            {{ 'health.ice.addContact' | transloco }}
          </button>
        }
        @if (dirty()) {
          <button
            matButton="filled"
            [disabled]="!valid()"
            (click)="saveContacts()"
          >
            {{ 'core.actions.save' | transloco }}
          </button>
        }
      </div>

      <mat-card appearance="outlined" class="card">
        <mat-card-content>
          @for (line of lines(); track $index) {
            <p [class.first]="$first">{{ line }}</p>
          }
        </mat-card-content>
        <mat-card-actions align="end">
          <button matButton (click)="print()">
            <mat-icon>print</mat-icon> {{ 'health.ice.print' | transloco }}
          </button>
          <button matButton="tonal" (click)="downloadLockScreen()">
            <mat-icon>smartphone</mat-icon>
            {{ 'health.ice.lockScreen' | transloco }}
          </button>
        </mat-card-actions>
      </mat-card>
    </section>
  `,
  styles: `
    .ice {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    h2,
    h3 {
      margin: 8px 0 0;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .contact {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .contact mat-form-field {
      flex: 1 1 160px;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .card p {
      margin: 4px 0;
      overflow-wrap: anywhere;
    }
    .card p.first {
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-error);
    }
  `,
})
export class IceCardComponent {
  private readonly api = inject(HealthApi);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  readonly record = input.required<HealthRecord>();
  readonly saved = output<void>();

  /** The contacts as edited, until saved; `null` — as stored. */
  private readonly edited = signal<EmergencyContact[] | null>(null);
  protected readonly contacts = computed(
    () => this.edited() ?? this.record().profile.emergencyContacts,
  );
  protected readonly dirty = computed(() => this.edited() !== null);
  protected readonly valid = computed(() =>
    this.contacts().every(
      contact => contact.name.trim() && contact.phone.trim().length >= 3,
    ),
  );

  protected readonly lines = computed(() =>
    iceLines(
      this.record(),
      this.auth.user()?.displayName ?? '',
      today(),
      this.words(),
    ),
  );

  protected change(
    index: number,
    field: keyof EmergencyContact,
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement).value;
    this.edited.set(
      this.contacts().map((contact, i) =>
        i === index ? {...contact, [field]: value} : contact,
      ),
    );
  }

  protected addContact(): void {
    this.edited.set([...this.contacts(), {name: '', phone: '', relation: ''}]);
  }

  protected removeContact(index: number): void {
    this.edited.set(this.contacts().filter((_, i) => i !== index));
  }

  protected async saveContacts(): Promise<void> {
    const profile = this.record().profile;
    await this.api.client.saveProfile({
      bloodType: profile.bloodType,
      notes: profile.notes,
      emergencyContacts: this.contacts(),
    });
    this.edited.set(null);
    this.saved.emit();
  }

  /** The card alone on a page of its own, printed: to cut out for the wallet. */
  protected print(): void {
    const escape = (text: string) =>
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const page = window.open('', '_blank', 'width=600,height=800');
    if (!page) {
      return;
    }
    const lines = this.lines()
      .map((line, i) =>
        i === 0 ? `<h1>${escape(line)}</h1>` : `<p>${escape(line)}</p>`,
      )
      .join('');
    page.document.write(
      '<!doctype html><meta charset="utf-8"><title>ICE</title>' +
        '<style>body{font:14px system-ui,sans-serif;margin:24px}' +
        '.card{border:2px solid #c00;border-radius:12px;padding:16px;max-width:420px}' +
        'h1{font-size:18px;color:#c00;margin:0 0 8px}p{margin:4px 0}</style>' +
        `<div class="card">${lines}</div>`,
    );
    page.document.close();
    page.focus();
    page.print();
  }

  /** A picture for the lock screen: the card under the clock, its QR code below. */
  protected async downloadLockScreen(): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.width = SCREEN.width;
    canvas.height = SCREEN.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.fillStyle = '#111';
    context.fillRect(0, 0, SCREEN.width, SCREEN.height);
    const margin = 90;
    let y = SCREEN.height * 0.32;
    this.lines().forEach((line, index) => {
      context.fillStyle = index === 0 ? '#ff5a5a' : '#fff';
      context.font = `${index === 0 ? 'bold 58px' : '44px'} system-ui, sans-serif`;
      for (const part of wrap(context, line, SCREEN.width - margin * 2)) {
        context.fillText(part, margin, y);
        y += index === 0 ? 76 : 60;
      }
      y += 16;
    });
    const qr = new Image();
    qr.src = await QRCode.toDataURL(this.lines().join('\n'), {
      margin: 1,
      width: 520,
    });
    await qr.decode();
    const size = 520;
    context.fillStyle = '#fff';
    context.fillRect(
      (SCREEN.width - size) / 2 - 20,
      SCREEN.height - size - 220,
      size + 40,
      size + 40,
    );
    context.drawImage(
      qr,
      (SCREEN.width - size) / 2,
      SCREEN.height - size - 200,
      size,
      size,
    );
    const link = document.createElement('a');
    link.download = 'ice-lock-screen.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  private words(): IceWords {
    const t = (key: string) =>
      this.transloco.translate(`health.ice.card.${key}`);
    return {
      title: t('title'),
      blood: t('blood'),
      allergies: t('allergies'),
      conditions: t('conditions'),
      medications: t('medications'),
      notes: t('notes'),
      contacts: t('contacts'),
      severity: {
        mild: this.transloco.translate('health.profile.severities.mild'),
        moderate: this.transloco.translate(
          'health.profile.severities.moderate',
        ),
        severe: this.transloco.translate('health.profile.severities.severe'),
      },
    };
  }
}

/** A line broken into the pieces that fit the width. */
function wrap(
  context: CanvasRenderingContext2D,
  line: string,
  width: number,
): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const word of line.split(' ')) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width > width && current) {
      pieces.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  return current ? [...pieces, current] : pieces;
}
