import { DiagnosisStatus, HealthStudyKind, SummaryLanguage } from '@pd/contracts';

/**
 * The fixed words of a summary in the doctor's language: headings, statuses, specialities. The
 * texts of the history itself are as written, or translated by the AI when asked.
 */
export interface SummaryText {
  title: string;
  patient: string;
  madeOn: string;
  period: (from: string) => string;
  disclaimer: string;
  translated: string;
  conditions: string;
  medications: string;
  labs: string;
  studies: string;
  visits: string;
  none: string;
  code: string;
  diagnosis: string;
  status: string;
  since: string;
  last: string;
  medication: string;
  substance: string;
  dose: string;
  taken: string;
  now: string;
  stopped: (reason: string) => string;
  analyte: string;
  value: string;
  range: string;
  date: string;
  earlier: string;
  high: string;
  low: string;
  complaints: string;
  findings: string;
  recommendations: string;
  statuses: Record<DiagnosisStatus, string>;
  studyKinds: Record<HealthStudyKind, string>;
  specialities: Record<string, string>;
}

const en: SummaryText = {
  title: 'Medical history summary',
  patient: 'Patient',
  madeOn: 'Compiled on',
  period: (from) => `Since ${from}`,
  disclaimer:
    'Compiled by the patient from their own medical documents (several countries and clinics). ' +
    'It is not a record of a clinic; the original documents can be shown on request.',
  translated: 'The texts were translated automatically; codes and numbers are as in the originals.',
  conditions: 'Diagnoses',
  medications: 'Medications',
  labs: 'Latest lab results',
  studies: 'Studies',
  visits: 'Visits',
  none: 'None recorded.',
  code: 'Code',
  diagnosis: 'Diagnosis',
  status: 'Status',
  since: 'First',
  last: 'Last',
  medication: 'Medication',
  substance: 'Active substance',
  dose: 'Dose and schedule',
  taken: 'Taken',
  now: 'now',
  stopped: (reason) => `stopped: ${reason}`,
  analyte: 'Test',
  value: 'Result',
  range: 'Reference range',
  date: 'Date',
  earlier: 'Earlier',
  high: 'above range',
  low: 'below range',
  complaints: 'Complaints',
  findings: 'Examination',
  recommendations: 'Recommendations',
  statuses: {
    suspected: 'suspected',
    confirmed: 'confirmed',
    ruledOut: 'ruled out',
    remission: 'in remission',
  },
  studyKinds: {
    ultrasound: 'Ultrasound',
    mri: 'MRI',
    ct: 'CT',
    xray: 'X-ray',
    ecg: 'ECG',
    eeg: 'EEG',
    endoscopy: 'Endoscopy',
    other: 'Study',
  },
  specialities: {
    general: 'General practitioner',
    psychiatrist: 'Psychiatrist',
    psychotherapist: 'Psychotherapist',
    psychologist: 'Psychologist',
    neurologist: 'Neurologist',
    cardiologist: 'Cardiologist',
    endocrinologist: 'Endocrinologist',
    gastroenterologist: 'Gastroenterologist',
    dermatologist: 'Dermatologist',
    ophthalmologist: 'Ophthalmologist',
    ent: 'ENT',
    dentist: 'Dentist',
    gynecologist: 'Gynecologist',
    urologist: 'Urologist',
    orthopedist: 'Orthopedist',
    surgeon: 'Surgeon',
    allergist: 'Allergist',
    pulmonologist: 'Pulmonologist',
  },
};

const pl: SummaryText = {
  title: 'Podsumowanie historii choroby',
  patient: 'Pacjent',
  madeOn: 'Sporządzono',
  period: (from) => `Od ${from}`,
  disclaimer:
    'Sporządzone przez pacjenta na podstawie własnej dokumentacji medycznej (kilka krajów i ' +
    'placówek). Nie jest to dokumentacja placówki; oryginały dokumentów mogą zostać okazane.',
  translated: 'Teksty przetłumaczono automatycznie; kody i liczby są jak w oryginałach.',
  conditions: 'Rozpoznania',
  medications: 'Leki',
  labs: 'Ostatnie wyniki badań laboratoryjnych',
  studies: 'Badania',
  visits: 'Wizyty',
  none: 'Brak danych.',
  code: 'Kod',
  diagnosis: 'Rozpoznanie',
  status: 'Status',
  since: 'Pierwsze',
  last: 'Ostatnie',
  medication: 'Lek',
  substance: 'Substancja czynna',
  dose: 'Dawka i dawkowanie',
  taken: 'Przyjmowany',
  now: 'obecnie',
  stopped: (reason) => `odstawiony: ${reason}`,
  analyte: 'Badanie',
  value: 'Wynik',
  range: 'Zakres referencyjny',
  date: 'Data',
  earlier: 'Wcześniej',
  high: 'powyżej normy',
  low: 'poniżej normy',
  complaints: 'Dolegliwości',
  findings: 'Badanie przedmiotowe',
  recommendations: 'Zalecenia',
  statuses: {
    suspected: 'podejrzenie',
    confirmed: 'potwierdzone',
    ruledOut: 'wykluczone',
    remission: 'remisja',
  },
  studyKinds: {
    ultrasound: 'USG',
    mri: 'Rezonans magnetyczny',
    ct: 'Tomografia komputerowa',
    xray: 'RTG',
    ecg: 'EKG',
    eeg: 'EEG',
    endoscopy: 'Endoskopia',
    other: 'Badanie',
  },
  specialities: {
    general: 'Lekarz rodzinny',
    psychiatrist: 'Psychiatra',
    psychotherapist: 'Psychoterapeuta',
    psychologist: 'Psycholog',
    neurologist: 'Neurolog',
    cardiologist: 'Kardiolog',
    endocrinologist: 'Endokrynolog',
    gastroenterologist: 'Gastroenterolog',
    dermatologist: 'Dermatolog',
    ophthalmologist: 'Okulista',
    ent: 'Laryngolog',
    dentist: 'Stomatolog',
    gynecologist: 'Ginekolog',
    urologist: 'Urolog',
    orthopedist: 'Ortopeda',
    surgeon: 'Chirurg',
    allergist: 'Alergolog',
    pulmonologist: 'Pulmonolog',
  },
};

const uk: SummaryText = {
  title: 'Виписка з історії хвороби',
  patient: 'Пацієнт',
  madeOn: 'Складено',
  period: (from) => `З ${from}`,
  disclaimer:
    'Складено пацієнтом за власними медичними документами (кілька країн і закладів). Це не ' +
    'документація закладу; оригінали документів можна показати на запит.',
  translated: 'Тексти перекладено автоматично; коди й числа — як в оригіналах.',
  conditions: 'Діагнози',
  medications: 'Ліки',
  labs: 'Останні результати аналізів',
  studies: 'Дослідження',
  visits: 'Візити',
  none: 'Немає даних.',
  code: 'Код',
  diagnosis: 'Діагноз',
  status: 'Статус',
  since: 'Уперше',
  last: 'Востаннє',
  medication: 'Препарат',
  substance: 'Діюча речовина',
  dose: 'Доза і прийом',
  taken: 'Приймається',
  now: 'зараз',
  stopped: (reason) => `скасовано: ${reason}`,
  analyte: 'Показник',
  value: 'Результат',
  range: 'Референтні значення',
  date: 'Дата',
  earlier: 'Раніше',
  high: 'вище норми',
  low: 'нижче норми',
  complaints: 'Скарги',
  findings: 'Огляд',
  recommendations: 'Рекомендації',
  statuses: {
    suspected: 'попередній',
    confirmed: 'підтверджений',
    ruledOut: 'знятий',
    remission: 'ремісія',
  },
  studyKinds: {
    ultrasound: 'УЗД',
    mri: 'МРТ',
    ct: 'КТ',
    xray: 'Рентген',
    ecg: 'ЕКГ',
    eeg: 'ЕЕГ',
    endoscopy: 'Ендоскопія',
    other: 'Дослідження',
  },
  specialities: {
    general: 'Сімейний лікар',
    psychiatrist: 'Психіатр',
    psychotherapist: 'Психотерапевт',
    psychologist: 'Психолог',
    neurologist: 'Невролог',
    cardiologist: 'Кардіолог',
    endocrinologist: 'Ендокринолог',
    gastroenterologist: 'Гастроентеролог',
    dermatologist: 'Дерматолог',
    ophthalmologist: 'Офтальмолог',
    ent: 'ЛОР',
    dentist: 'Стоматолог',
    gynecologist: 'Гінеколог',
    urologist: 'Уролог',
    orthopedist: 'Ортопед',
    surgeon: 'Хірург',
    allergist: 'Алерголог',
    pulmonologist: 'Пульмонолог',
  },
};

const ru: SummaryText = {
  title: 'Выписка из истории болезни',
  patient: 'Пациент',
  madeOn: 'Составлено',
  period: (from) => `С ${from}`,
  disclaimer:
    'Составлено пациентом по собственным медицинским документам (несколько стран и клиник). ' +
    'Это не документация учреждения; оригиналы документов можно показать по запросу.',
  translated: 'Тексты переведены автоматически; коды и числа — как в оригиналах.',
  conditions: 'Диагнозы',
  medications: 'Лекарства',
  labs: 'Последние результаты анализов',
  studies: 'Исследования',
  visits: 'Визиты',
  none: 'Нет данных.',
  code: 'Код',
  diagnosis: 'Диагноз',
  status: 'Статус',
  since: 'Впервые',
  last: 'Последний раз',
  medication: 'Препарат',
  substance: 'Действующее вещество',
  dose: 'Доза и приём',
  taken: 'Принимается',
  now: 'сейчас',
  stopped: (reason) => `отменён: ${reason}`,
  analyte: 'Показатель',
  value: 'Результат',
  range: 'Референсные значения',
  date: 'Дата',
  earlier: 'Ранее',
  high: 'выше нормы',
  low: 'ниже нормы',
  complaints: 'Жалобы',
  findings: 'Осмотр',
  recommendations: 'Рекомендации',
  statuses: {
    suspected: 'предварительный',
    confirmed: 'подтверждён',
    ruledOut: 'снят',
    remission: 'ремиссия',
  },
  studyKinds: {
    ultrasound: 'УЗИ',
    mri: 'МРТ',
    ct: 'КТ',
    xray: 'Рентген',
    ecg: 'ЭКГ',
    eeg: 'ЭЭГ',
    endoscopy: 'Эндоскопия',
    other: 'Исследование',
  },
  specialities: {
    general: 'Терапевт / семейный врач',
    psychiatrist: 'Психиатр',
    psychotherapist: 'Психотерапевт',
    psychologist: 'Психолог',
    neurologist: 'Невролог',
    cardiologist: 'Кардиолог',
    endocrinologist: 'Эндокринолог',
    gastroenterologist: 'Гастроэнтеролог',
    dermatologist: 'Дерматолог',
    ophthalmologist: 'Офтальмолог',
    ent: 'ЛОР',
    dentist: 'Стоматолог',
    gynecologist: 'Гинеколог',
    urologist: 'Уролог',
    orthopedist: 'Ортопед',
    surgeon: 'Хирург',
    allergist: 'Аллерголог',
    pulmonologist: 'Пульмонолог',
  },
};

const de: SummaryText = {
  title: 'Zusammenfassung der Krankengeschichte',
  patient: 'Patient',
  madeOn: 'Erstellt am',
  period: (from) => `Seit ${from}`,
  disclaimer:
    'Vom Patienten aus eigenen medizinischen Unterlagen (mehrere Länder und Einrichtungen) ' +
    'zusammengestellt. Keine Dokumentation einer Einrichtung; die Originale können vorgelegt werden.',
  translated: 'Die Texte wurden automatisch übersetzt; Codes und Zahlen wie im Original.',
  conditions: 'Diagnosen',
  medications: 'Medikamente',
  labs: 'Letzte Laborwerte',
  studies: 'Untersuchungen',
  visits: 'Arztbesuche',
  none: 'Keine Angaben.',
  code: 'Code',
  diagnosis: 'Diagnose',
  status: 'Status',
  since: 'Erstmals',
  last: 'Zuletzt',
  medication: 'Medikament',
  substance: 'Wirkstoff',
  dose: 'Dosis und Einnahme',
  taken: 'Eingenommen',
  now: 'aktuell',
  stopped: (reason) => `abgesetzt: ${reason}`,
  analyte: 'Wert',
  value: 'Ergebnis',
  range: 'Referenzbereich',
  date: 'Datum',
  earlier: 'Früher',
  high: 'über dem Referenzbereich',
  low: 'unter dem Referenzbereich',
  complaints: 'Beschwerden',
  findings: 'Befund',
  recommendations: 'Empfehlungen',
  statuses: {
    suspected: 'Verdacht',
    confirmed: 'gesichert',
    ruledOut: 'ausgeschlossen',
    remission: 'in Remission',
  },
  studyKinds: {
    ultrasound: 'Ultraschall',
    mri: 'MRT',
    ct: 'CT',
    xray: 'Röntgen',
    ecg: 'EKG',
    eeg: 'EEG',
    endoscopy: 'Endoskopie',
    other: 'Untersuchung',
  },
  specialities: {
    general: 'Hausarzt',
    psychiatrist: 'Psychiater',
    psychotherapist: 'Psychotherapeut',
    psychologist: 'Psychologe',
    neurologist: 'Neurologe',
    cardiologist: 'Kardiologe',
    endocrinologist: 'Endokrinologe',
    gastroenterologist: 'Gastroenterologe',
    dermatologist: 'Dermatologe',
    ophthalmologist: 'Augenarzt',
    ent: 'HNO-Arzt',
    dentist: 'Zahnarzt',
    gynecologist: 'Gynäkologe',
    urologist: 'Urologe',
    orthopedist: 'Orthopäde',
    surgeon: 'Chirurg',
    allergist: 'Allergologe',
    pulmonologist: 'Pneumologe',
  },
};

const TEXTS: Record<SummaryLanguage, SummaryText> = { en, pl, uk, ru, de };

export function summaryText(language: SummaryLanguage): SummaryText {
  return TEXTS[language];
}

/** The speciality in the doctor's language; one typed by hand as it is. */
export function specialityName(text: SummaryText, speciality: string | null): string {
  return speciality ? (text.specialities[speciality] ?? speciality) : '';
}

/** `PL` → "Polska" in the doctor's language. */
export function countryName(language: SummaryLanguage, code: string | null): string {
  if (!code) {
    return '';
  }
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** `2026-10-13` → `13.10.2026`: one way every reader of these languages reads a date. */
export function formatDay(day: string | null): string {
  if (!day) {
    return '';
  }
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}
