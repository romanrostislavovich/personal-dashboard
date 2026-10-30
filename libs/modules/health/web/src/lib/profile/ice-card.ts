import {healthConditions, HealthRecord} from '@pd/contracts';

/** The words of the card, in the language of the page. */
export interface IceWords {
  title: string;
  blood: string;
  allergies: string;
  conditions: string;
  medications: string;
  notes: string;
  contacts: string;
  severity: Record<string, string>;
}

/**
 * The ICE card ("In Case of Emergency") of the medical record: what a stranger or a paramedic
 * needs at once — the blood type, the allergies (severe first), the conditions going on, the
 * medications taken now, the notes for an emergency and whom to call. Lines of text: the card
 * on the page, the print, the picture for the lock screen and its QR code are made of them.
 */
export function iceLines(
  record: HealthRecord,
  name: string,
  today: string,
  words: IceWords,
): string[] {
  const {profile} = record;
  const allergies = profile.allergies.map(allergy =>
    allergy.severity
      ? `${allergy.substance} (${words.severity[allergy.severity] ?? allergy.severity})`
      : allergy.substance,
  );
  const conditions = healthConditions(record.diagnoses)
    .filter(
      condition =>
        condition.status === 'confirmed' || condition.status === 'suspected',
    )
    .map(condition =>
      condition.code
        ? `${condition.title} (${condition.code})`
        : condition.title,
    );
  const medications = record.medications
    .filter(
      medication => !medication.stoppedOn || medication.stoppedOn >= today,
    )
    .map(medication =>
      [medication.name, medication.dose].filter(Boolean).join(' '),
    );
  const contacts = profile.emergencyContacts.map(
    contact =>
      `${contact.name}${contact.relation ? ` (${contact.relation})` : ''}: ${contact.phone}`,
  );
  return [
    `${words.title} — ${name}`,
    ...(profile.bloodType ? [`${words.blood}: ${profile.bloodType}`] : []),
    ...(allergies.length
      ? [`${words.allergies}: ${allergies.join(', ')}`]
      : []),
    ...(conditions.length
      ? [`${words.conditions}: ${conditions.join(', ')}`]
      : []),
    ...(medications.length
      ? [`${words.medications}: ${medications.join(', ')}`]
      : []),
    ...(profile.notes ? [`${words.notes}: ${profile.notes}`] : []),
    ...(contacts.length ? [`${words.contacts}: ${contacts.join('; ')}`] : []),
  ];
}
