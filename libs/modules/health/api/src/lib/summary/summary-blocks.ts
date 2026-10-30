import {HealthSummary} from '@pd/contracts';
import {
  countryName,
  formatDay,
  specialityName,
  summaryText,
} from './summary-text';

/**
 * A summary as headings, paragraphs and tables — what the page and the Word document are both
 * made of, so they say the same.
 */
export type SummaryBlock =
  | {kind: 'title'; text: string}
  | {kind: 'heading'; text: string}
  | {kind: 'paragraph'; text: string; muted?: boolean}
  | {kind: 'table'; head: string[]; rows: string[][]; marked?: boolean[]};

export function summaryBlocks(summary: HealthSummary): SummaryBlock[] {
  const t = summaryText(summary.language);
  const blocks: SummaryBlock[] = [
    {kind: 'title', text: t.title},
    {
      kind: 'paragraph',
      text: [
        `${t.patient}: ${summary.patient}`,
        `${t.madeOn}: ${formatDay(summary.madeOn)}`,
        summary.from ? t.period(formatDay(summary.from)) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {kind: 'paragraph', text: t.disclaimer, muted: true},
  ];
  if (summary.translated) {
    blocks.push({kind: 'paragraph', text: t.translated, muted: true});
  }
  const section = (
    heading: string,
    rows: number,
    table: () => SummaryBlock[],
  ) => {
    blocks.push({kind: 'heading', text: heading});
    blocks.push(
      ...(rows
        ? table()
        : [{kind: 'paragraph', text: t.none, muted: true} as const]),
    );
  };

  // What a doctor must know first: the blood type and the allergies.
  if (summary.profile) {
    const {bloodType, allergies} = summary.profile;
    if (bloodType) {
      blocks.push({kind: 'paragraph', text: `${t.bloodType}: ${bloodType}`});
    }
    blocks.push({kind: 'heading', text: t.allergies});
    blocks.push(
      allergies.length
        ? {
            kind: 'table',
            head: [t.allergies, t.reaction, ''],
            rows: allergies.map(a => [
              a.substance,
              a.reaction ?? '',
              a.severity ? t.severities[a.severity] : '',
            ]),
            marked: allergies.map(a => a.severity === 'severe'),
          }
        : {kind: 'paragraph', text: t.noAllergies, muted: true},
    );
  }

  if (summary.conditions) {
    const conditions = summary.conditions;
    section(t.conditions, conditions.length, () => [
      {
        kind: 'table',
        head: [t.code, t.diagnosis, t.status, t.since, t.last],
        rows: conditions.map(c => [
          c.code ?? '',
          c.title,
          t.statuses[c.status],
          formatDay(c.firstOn),
          c.lastOn === c.firstOn ? '' : formatDay(c.lastOn),
        ]),
      },
    ]);
  }

  if (summary.medications) {
    const medications = summary.medications;
    section(t.medications, medications.length, () => [
      {
        kind: 'table',
        head: [t.medication, t.substance, t.dose, t.taken],
        rows: medications.map(m => [
          m.name,
          m.substance ?? '',
          [m.dose, m.schedule].filter(Boolean).join(', '),
          [
            [
              formatDay(m.startedOn),
              m.stoppedOn ? formatDay(m.stoppedOn) : t.now,
            ]
              .filter(Boolean)
              .join(' – '),
            m.stopReason ? t.stopped(m.stopReason) : '',
          ]
            .filter(Boolean)
            .join('; '),
        ]),
      },
    ]);
  }

  if (summary.labs) {
    const labs = summary.labs;
    section(t.labs, labs.length, () => [
      {
        kind: 'table',
        head: [t.analyte, t.value, t.range, t.date, t.earlier],
        rows: labs.map(l => [
          l.name,
          `${l.value} ${l.unit}`.trim() +
            (l.flag ? ` (${l.flag === 'high' ? t.high : t.low})` : ''),
          range(l.low, l.high),
          formatDay(l.day),
          l.earlier.map(e => `${formatDay(e.day)}: ${e.value}`).join('; '),
        ]),
        marked: labs.map(l => l.flag !== null),
      },
    ]);
  }

  if (summary.studies) {
    const studies = summary.studies;
    section(t.studies, studies.length, () =>
      studies.flatMap(s => [
        {
          kind: 'paragraph' as const,
          text: `${formatDay(s.performedOn)} · ${t.studyKinds[s.kind]}${s.area ? ` · ${s.area}` : ''}`,
        },
        ...(s.conclusion
          ? [{kind: 'paragraph' as const, text: s.conclusion, muted: true}]
          : []),
      ]),
    );
  }

  if (summary.profile?.operations.length) {
    const operations = summary.profile.operations;
    section(t.operations, operations.length, () =>
      operations.map(o => ({
        kind: 'paragraph' as const,
        text: `${formatDay(o.performedOn)} · ${o.title}`,
      })),
    );
  }

  if (summary.profile?.vaccinations.length) {
    const vaccinations = summary.profile.vaccinations;
    section(t.vaccinations, vaccinations.length, () => [
      {
        kind: 'table',
        head: [t.vaccine, t.date],
        rows: vaccinations.map(v => [
          v.dose ? `${v.vaccine} (${v.dose})` : v.vaccine,
          formatDay(v.givenOn),
        ]),
      },
    ]);
  }

  if (summary.visits) {
    const visits = summary.visits;
    section(t.visits, visits.length, () =>
      visits.flatMap(v => {
        const head = [
          formatDay(v.visitedOn),
          specialityName(t, v.speciality),
          v.doctor,
          v.clinic,
          countryName(summary.language, v.country),
        ]
          .filter(Boolean)
          .join(' · ');
        const lines = [
          v.diagnoses.length ? v.diagnoses.join('; ') : '',
          v.complaints ? `${t.complaints}: ${v.complaints}` : '',
          v.findings ? `${t.findings}: ${v.findings}` : '',
          v.recommendations ? `${t.recommendations}: ${v.recommendations}` : '',
        ].filter(Boolean);
        return [
          {kind: 'paragraph' as const, text: head},
          ...lines.map(text => ({
            kind: 'paragraph' as const,
            text,
            muted: true,
          })),
        ];
      }),
    );
  }
  return blocks;
}

function range(low: number | null, high: number | null): string {
  if (low !== null && high !== null) {
    return `${low}–${high}`;
  }
  if (high !== null) {
    return `< ${high}`;
  }
  return low !== null ? `> ${low}` : '';
}
