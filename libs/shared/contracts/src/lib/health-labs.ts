/**
 * Lab results across laboratories and countries: the same analyte is named in Ukrainian,
 * Russian, Polish or English and measured in different units (glucose in mmol/L in Kyiv and
 * Warsaw, in mg/dL in a US lab). Here each common analyte has a key, its names and the units it
 * comes in, so its values line up on one chart in one unit.
 *
 * Facts only: a value is "out of range" by the reference range of the laboratory that measured
 * it, never by a range of ours.
 */

/** A unit and how to get the canonical one out of it: `canonical = value × factor + offset`. */
interface UnitConversion {
  unit: string;
  factor: number;
  offset?: number;
}

export interface LabAnalyte {
  key: string;
  /** The unit the chart is drawn in. */
  unit: string;
  /** Names and abbreviations as labs write them, in uk / ru / pl / en (matched loosely). */
  names: string[];
  /** Other units it comes in. */
  units?: UnitConversion[];
}

const MG_DL_GLUCOSE = 1 / 18.016;

export const LAB_ANALYTES: readonly LabAnalyte[] = [
  // --- Blood count ---
  {
    key: 'hemoglobin',
    unit: 'g/L',
    names: ['hemoglobin', 'haemoglobin', 'hgb', 'hb', 'гемоглобин', 'гемоглобін', 'hemoglobina'],
    units: [
      { unit: 'g/dL', factor: 10 },
      { unit: 'mmol/L', factor: 16.11 },
    ],
  },
  {
    key: 'rbc',
    unit: '10^12/L',
    names: ['rbc', 'red blood cells', 'erythrocytes', 'эритроциты', 'еритроцити', 'erytrocyty'],
    units: [{ unit: '10^6/uL', factor: 1 }],
  },
  {
    key: 'wbc',
    unit: '10^9/L',
    names: ['wbc', 'white blood cells', 'leukocytes', 'лейкоциты', 'лейкоцити', 'leukocyty'],
    units: [{ unit: '10^3/uL', factor: 1 }],
  },
  {
    key: 'platelets',
    unit: '10^9/L',
    names: ['plt', 'platelets', 'тромбоциты', 'тромбоцити', 'płytki krwi', 'trombocyty'],
    units: [{ unit: '10^3/uL', factor: 1 }],
  },
  {
    key: 'hematocrit',
    unit: '%',
    names: ['hct', 'hematocrit', 'haematocrit', 'гематокрит', 'hematokryt'],
    units: [{ unit: 'L/L', factor: 100 }],
  },
  { key: 'mcv', unit: 'fL', names: ['mcv'] },
  { key: 'mch', unit: 'pg', names: ['mch'] },
  { key: 'mchc', unit: 'g/L', names: ['mchc'], units: [{ unit: 'g/dL', factor: 10 }] },
  { key: 'rdw', unit: '%', names: ['rdw', 'rdw-cv'] },
  {
    key: 'neutrophils',
    unit: '%',
    names: ['neutrophils', 'neu', 'нейтрофилы', 'нейтрофіли', 'neutrofile'],
  },
  {
    key: 'lymphocytes',
    unit: '%',
    names: ['lymphocytes', 'lym', 'лимфоциты', 'лімфоцити', 'limfocyty'],
  },
  { key: 'monocytes', unit: '%', names: ['monocytes', 'mon', 'моноциты', 'моноцити', 'monocyty'] },
  {
    key: 'eosinophils',
    unit: '%',
    names: ['eosinophils', 'eos', 'эозинофилы', 'еозинофіли', 'eozynofile'],
  },
  { key: 'basophils', unit: '%', names: ['basophils', 'bas', 'базофилы', 'базофіли', 'bazofile'] },
  {
    key: 'esr',
    unit: 'mm/h',
    names: ['esr', 'соэ', 'шое', 'ob', 'odczyn biernackiego', 'sed rate'],
  },

  // --- Metabolism ---
  {
    key: 'glucose',
    unit: 'mmol/L',
    names: ['glucose', 'glu', 'глюкоза', 'glukoza', 'blood sugar', 'сахар крови'],
    units: [{ unit: 'mg/dL', factor: MG_DL_GLUCOSE }],
  },
  {
    key: 'hba1c',
    unit: '%',
    names: [
      'hba1c',
      'a1c',
      'гликированный гемоглобин',
      'глікований гемоглобін',
      'hemoglobina glikowana',
    ],
    // The IFCC unit; % = 0.09148 × mmol/mol + 2.152 (NGSP).
    units: [{ unit: 'mmol/mol', factor: 0.09148, offset: 2.152 }],
  },
  {
    key: 'insulin',
    unit: 'mIU/L',
    names: ['insulin', 'инсулин', 'інсулін', 'insulina'],
    units: [
      { unit: 'uIU/mL', factor: 1 },
      { unit: 'pmol/L', factor: 0.144 },
    ],
  },
  {
    key: 'cholesterol',
    unit: 'mmol/L',
    names: [
      'cholesterol',
      'total cholesterol',
      'chol',
      'холестерин',
      'холестерин общий',
      'холестерин загальний',
      'cholesterol całkowity',
    ],
    units: [{ unit: 'mg/dL', factor: 0.02586 }],
  },
  {
    key: 'hdl',
    unit: 'mmol/L',
    names: ['hdl', 'hdl cholesterol', 'лпвп', 'холестерин лпвп', 'cholesterol hdl'],
    units: [{ unit: 'mg/dL', factor: 0.02586 }],
  },
  {
    key: 'ldl',
    unit: 'mmol/L',
    names: ['ldl', 'ldl cholesterol', 'лпнп', 'холестерин лпнп', 'cholesterol ldl'],
    units: [{ unit: 'mg/dL', factor: 0.02586 }],
  },
  {
    key: 'triglycerides',
    unit: 'mmol/L',
    names: ['triglycerides', 'tg', 'триглицериды', 'тригліцериди', 'triglicerydy', 'trójglicerydy'],
    units: [{ unit: 'mg/dL', factor: 0.01129 }],
  },

  // --- Liver and kidneys ---
  {
    key: 'alt',
    unit: 'U/L',
    names: [
      'alt',
      'alat',
      'gpt',
      'алт',
      'алат',
      'аланинаминотрансфераза',
      'аланінамінотрансфераза',
    ],
    units: [{ unit: 'ukat/L', factor: 60 }],
  },
  {
    key: 'ast',
    unit: 'U/L',
    names: [
      'ast',
      'asat',
      'got',
      'аст',
      'асат',
      'аспартатаминотрансфераза',
      'аспартатамінотрансфераза',
    ],
    units: [{ unit: 'ukat/L', factor: 60 }],
  },
  {
    key: 'ggt',
    unit: 'U/L',
    names: ['ggt', 'ggtp', 'ггт', 'ггтп', 'гамма-гт', 'гамма-глутамилтрансфераза'],
    units: [{ unit: 'ukat/L', factor: 60 }],
  },
  {
    key: 'alp',
    unit: 'U/L',
    names: [
      'alp',
      'alkaline phosphatase',
      'щелочная фосфатаза',
      'лужна фосфатаза',
      'fosfataza alkaliczna',
    ],
    units: [{ unit: 'ukat/L', factor: 60 }],
  },
  {
    key: 'bilirubin',
    unit: 'umol/L',
    names: [
      'bilirubin',
      'total bilirubin',
      'билирубин',
      'билирубин общий',
      'білірубін',
      'білірубін загальний',
      'bilirubina',
      'bilirubina całkowita',
    ],
    units: [{ unit: 'mg/dL', factor: 17.1 }],
  },
  {
    key: 'bilirubinDirect',
    unit: 'umol/L',
    names: ['direct bilirubin', 'билирубин прямой', 'білірубін прямий', 'bilirubina bezpośrednia'],
    units: [{ unit: 'mg/dL', factor: 17.1 }],
  },
  {
    key: 'protein',
    unit: 'g/L',
    names: ['total protein', 'общий белок', 'загальний білок', 'białko całkowite'],
    units: [{ unit: 'g/dL', factor: 10 }],
  },
  {
    key: 'albumin',
    unit: 'g/L',
    names: ['albumin', 'альбумин', 'альбумін', 'albumina'],
    units: [{ unit: 'g/dL', factor: 10 }],
  },
  {
    key: 'creatinine',
    unit: 'umol/L',
    names: ['creatinine', 'crea', 'креатинин', 'креатинін', 'kreatynina'],
    units: [{ unit: 'mg/dL', factor: 88.4 }],
  },
  {
    key: 'urea',
    unit: 'mmol/L',
    names: ['urea', 'мочевина', 'сечовина', 'mocznik'],
    units: [{ unit: 'mg/dL', factor: 0.1665 }],
  },
  {
    key: 'uricAcid',
    unit: 'umol/L',
    names: ['uric acid', 'мочевая кислота', 'сечова кислота', 'kwas moczowy'],
    units: [{ unit: 'mg/dL', factor: 59.48 }],
  },
  { key: 'egfr', unit: 'mL/min/1.73m2', names: ['egfr', 'скф', 'gfr'] },
  { key: 'ldh', unit: 'U/L', names: ['ldh', 'лдг', 'lactate dehydrogenase'] },
  { key: 'ck', unit: 'U/L', names: ['ck', 'cpk', 'кфк', 'creatine kinase', 'креатинкиназа'] },
  { key: 'amylase', unit: 'U/L', names: ['amylase', 'амилаза', 'амілаза', 'amylaza'] },
  { key: 'lipase', unit: 'U/L', names: ['lipase', 'липаза', 'ліпаза', 'lipaza'] },

  // --- Electrolytes and minerals ---
  {
    key: 'sodium',
    unit: 'mmol/L',
    names: ['sodium', 'na', 'натрий', 'натрій', 'sód'],
    units: [{ unit: 'mEq/L', factor: 1 }],
  },
  {
    key: 'potassium',
    unit: 'mmol/L',
    names: ['potassium', 'k', 'калий', 'калій', 'potas'],
    units: [{ unit: 'mEq/L', factor: 1 }],
  },
  {
    key: 'chloride',
    unit: 'mmol/L',
    names: ['chloride', 'cl', 'хлор', 'хлориды', 'chlorki'],
    units: [{ unit: 'mEq/L', factor: 1 }],
  },
  {
    key: 'calcium',
    unit: 'mmol/L',
    names: ['calcium', 'ca', 'кальций', 'кальцій', 'wapń'],
    units: [{ unit: 'mg/dL', factor: 0.2495 }],
  },
  {
    key: 'magnesium',
    unit: 'mmol/L',
    names: ['magnesium', 'mg', 'магний', 'магній', 'magnez'],
    units: [{ unit: 'mg/dL', factor: 0.4114 }],
  },
  {
    key: 'phosphorus',
    unit: 'mmol/L',
    names: ['phosphorus', 'phosphate', 'фосфор', 'fosfor', 'fosforany'],
    units: [{ unit: 'mg/dL', factor: 0.3229 }],
  },
  {
    key: 'iron',
    unit: 'umol/L',
    names: ['iron', 'serum iron', 'fe', 'железо', 'залізо', 'żelazo'],
    units: [{ unit: 'ug/dL', factor: 0.179 }],
  },
  {
    key: 'ferritin',
    unit: 'ug/L',
    names: ['ferritin', 'ферритин', 'феритин', 'ferrytyna'],
    units: [{ unit: 'ng/mL', factor: 1 }],
  },

  // --- Vitamins ---
  {
    key: 'vitaminD',
    unit: 'ng/mL',
    names: [
      'vitamin d',
      '25-oh vitamin d',
      '25(oh)d',
      'витамин d',
      'вітамін d',
      'witamina d',
      '25-oh-d3',
    ],
    units: [{ unit: 'nmol/L', factor: 0.4006 }],
  },
  {
    key: 'vitaminB12',
    unit: 'pmol/L',
    names: ['vitamin b12', 'b12', 'cobalamin', 'витамин b12', 'вітамін b12', 'witamina b12'],
    units: [{ unit: 'pg/mL', factor: 0.738 }],
  },
  {
    key: 'folate',
    unit: 'nmol/L',
    names: ['folate', 'folic acid', 'фолиевая кислота', 'фолієва кислота', 'kwas foliowy'],
    units: [{ unit: 'ng/mL', factor: 2.266 }],
  },

  // --- Hormones ---
  {
    key: 'tsh',
    unit: 'mIU/L',
    names: ['tsh', 'ттг', 'ттг', 'тиреотропный гормон', 'тиреотропний гормон'],
    units: [{ unit: 'uIU/mL', factor: 1 }],
  },
  {
    key: 'ft4',
    unit: 'pmol/L',
    names: ['ft4', 'free t4', 'т4 свободный', 'т4 вільний', 'св т4'],
    units: [{ unit: 'ng/dL', factor: 12.87 }],
  },
  {
    key: 'ft3',
    unit: 'pmol/L',
    names: ['ft3', 'free t3', 'т3 свободный', 'т3 вільний', 'св т3'],
    units: [{ unit: 'pg/mL', factor: 1.536 }],
  },
  {
    key: 'antiTpo',
    unit: 'IU/mL',
    names: ['anti-tpo', 'atpo', 'ат-тпо', 'ат к тпо', 'антитела к тпо'],
  },
  {
    key: 'cortisol',
    unit: 'nmol/L',
    names: ['cortisol', 'кортизол', 'kortyzol'],
    units: [{ unit: 'ug/dL', factor: 27.59 }],
  },
  {
    key: 'prolactin',
    unit: 'ng/mL',
    names: ['prolactin', 'prl', 'пролактин', 'prolaktyna'],
    units: [
      { unit: 'mIU/L', factor: 1 / 21.2 },
      { unit: 'ug/L', factor: 1 },
    ],
  },
  {
    key: 'testosterone',
    unit: 'nmol/L',
    names: ['testosterone', 'тестостерон', 'testosteron'],
    units: [{ unit: 'ng/dL', factor: 0.0347 }],
  },
  {
    key: 'estradiol',
    unit: 'pmol/L',
    names: ['estradiol', 'e2', 'эстрадиол', 'естрадіол'],
    units: [{ unit: 'pg/mL', factor: 3.671 }],
  },
  {
    key: 'psa',
    unit: 'ng/mL',
    names: ['psa', 'пса', 'total psa'],
    units: [{ unit: 'ug/L', factor: 1 }],
  },

  // --- Inflammation and coagulation ---
  {
    key: 'crp',
    unit: 'mg/L',
    names: [
      'crp',
      'c-reactive protein',
      'срб',
      'с-реактивный белок',
      'с-реактивний білок',
      'białko c-reaktywne',
    ],
    units: [{ unit: 'mg/dL', factor: 10 }],
  },
  { key: 'inr', unit: '', names: ['inr', 'мно', 'мнв'] },
  {
    key: 'fibrinogen',
    unit: 'g/L',
    names: ['fibrinogen', 'фибриноген', 'фібриноген', 'fibrynogen'],
    units: [{ unit: 'mg/dL', factor: 0.01 }],
  },

  // --- Drug levels (psychiatry above all) ---
  {
    key: 'lithium',
    unit: 'mmol/L',
    names: ['lithium', 'литий', 'літій', 'lit'],
    units: [{ unit: 'mEq/L', factor: 1 }],
  },
  {
    key: 'valproate',
    unit: 'mg/L',
    names: ['valproate', 'valproic acid', 'вальпроевая кислота', 'вальпроат', 'kwas walproinowy'],
    units: [
      { unit: 'ug/mL', factor: 1 },
      { unit: 'umol/L', factor: 0.1442 },
    ],
  },
];

const BY_KEY = new Map(LAB_ANALYTES.map((analyte) => [analyte.key, analyte]));

export function labAnalyte(key: string | null | undefined): LabAnalyte | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** Lower case, `ё` as `е`, no punctuation or extra spaces: how names are compared. */
function looseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const BY_NAME = new Map<string, string>();
for (const analyte of LAB_ANALYTES) {
  for (const name of [analyte.key, ...analyte.names]) {
    BY_NAME.set(looseName(name), analyte.key);
  }
}

/**
 * The analyte a lab's line is about: `Глюкоза`, `GLU`, `Glukoza (surowica)`. The whole name
 * first, then its part before a bracket or a comma; `undefined` — not one of ours.
 */
export function guessAnalyte(name: string): string | undefined {
  const whole = BY_NAME.get(looseName(name));
  if (whole) {
    return whole;
  }
  const head = name.split(/[([,;]/)[0];
  return head === name ? undefined : BY_NAME.get(looseName(head));
}

/**
 * One spelling of a unit for each: `ммоль/л`, `mmol/l` and `mmol/L` are `mmol/l`;
 * `мкмоль/л` and `µmol/L` are `umol/l`; Polish `tys/µl` is `10^3/ul`.
 */
export function looseUnit(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[µμ]/g, 'u')
    .replace(/×|x|\*/g, '')
    .replace(/⁹/g, '^9')
    .replace(/¹²/g, '^12')
    .replace(/³/g, '^3')
    .replace(/⁶/g, '^6')
    .replace(/^10(\d)/, '10^$1')
    .replace(/^tys\//, '10^3/')
    .replace(/^mln\//, '10^6/')
    .replace(/мкмоль/g, 'umol')
    .replace(/ммоль/g, 'mmol')
    .replace(/нмоль/g, 'nmol')
    .replace(/пмоль/g, 'pmol')
    .replace(/мкме|мкмо/g, 'uiu')
    .replace(/мме|ммо/g, 'miu')
    .replace(/ме/g, 'iu')
    .replace(/мэкв/g, 'meq')
    .replace(/ед/g, 'u')
    .replace(/мкг/g, 'ug')
    .replace(/мг/g, 'mg')
    .replace(/нг/g, 'ng')
    .replace(/пг/g, 'pg')
    .replace(/фл/g, 'fl')
    .replace(/мл/g, 'ml')
    .replace(/мкл/g, 'ul')
    .replace(/дл/g, 'dl')
    .replace(/мм\/ч(ас)?/g, 'mm/h')
    .replace(/л/g, 'l')
    .replace(/г/g, 'g')
    .replace(/mu\/ml/g, 'miu/ml')
    .replace(/μiu|uiu/g, 'uiu');
}

export interface CanonicalValue {
  value: number;
  unit: string;
  /** The laboratory's range in the same unit; `null` — not given. */
  low: number | null;
  high: number | null;
}

/**
 * A value in the analyte's own unit, with its range, for one chart across laboratories;
 * `null` — not one of ours, or a unit it is not known to come in (it is then shown as it is).
 */
export function toCanonical(
  key: string | null | undefined,
  value: number,
  unit: string | null | undefined,
  range: { low: number | null; high: number | null } = { low: null, high: null },
): CanonicalValue | null {
  const analyte = labAnalyte(key);
  if (!analyte) {
    return null;
  }
  const given = looseUnit(unit ?? '');
  const conversion =
    given === looseUnit(analyte.unit)
      ? { factor: 1, offset: 0 }
      : analyte.units?.find((candidate) => looseUnit(candidate.unit) === given);
  if (!conversion) {
    return null;
  }
  const convert = (x: number | null) =>
    x === null ? null : round(x * conversion.factor + (conversion.offset ?? 0));
  return {
    value: convert(value) as number,
    unit: analyte.unit,
    low: convert(range.low),
    high: convert(range.high),
  };
}

/** Enough digits for a chart and a table, no float noise (`5.550000001`). */
function round(value: number): number {
  return Number(value.toPrecision(4));
}

export type LabFlag = 'low' | 'high' | null;

/** Out of the laboratory's own range; `null` — within it, or no range given. */
export function labFlag(value: number | null, low: number | null, high: number | null): LabFlag {
  if (value === null) {
    return null;
  }
  if (low !== null && value < low) {
    return 'low';
  }
  if (high !== null && value > high) {
    return 'high';
  }
  return null;
}

/** A number as labs write it: `5,6`, `5.6`, `1 250`. */
function labNumber(text: string): number | null {
  const clean = text.replace(/\s+/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
}

/** A result as typed: a number is a value, anything else (`отрицательно`, `<0.5`) is text. */
export function parseLabResult(text: string): { value: number | null; textValue: string | null } {
  const trimmed = text.trim();
  const value = labNumber(trimmed);
  return value === null ? { value: null, textValue: trimmed || null } : { value, textValue: null };
}

/**
 * A reference range as typed: `3.9–5.5`, `3,9 - 5,5`, `<5.2`, `> 1`, `до 5.2`. Two numbers or one
 * bound; anything else (`отрицательно`) is kept as text.
 */
export function parseLabRange(text: string): {
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
} {
  const trimmed = text.trim();
  const none = { refLow: null, refHigh: null, refText: null };
  if (!trimmed) {
    return none;
  }
  const between = /^(-?[\d\s.,]+?)\s*(?:-|–|—|\.\.\.?|…)\s*(-?[\d\s.,]+)$/.exec(trimmed);
  if (between) {
    const low = labNumber(between[1]);
    const high = labNumber(between[2]);
    if (low !== null && high !== null) {
      return { refLow: low, refHigh: high, refText: null };
    }
  }
  const upTo = /^(?:<|≤|<=|до|do|up to)\s*([\d\s.,]+)$/i.exec(trimmed);
  if (upTo && labNumber(upTo[1]) !== null) {
    return { ...none, refHigh: labNumber(upTo[1]) };
  }
  const from = /^(?:>|≥|>=|от|від|od|from)\s*([\d\s.,]+)$/i.exec(trimmed);
  if (from && labNumber(from[1]) !== null) {
    return { ...none, refLow: labNumber(from[1]) };
  }
  return { ...none, refText: trimmed };
}

/** A range back as text, for editing: `3.9–5.5`, `<5.2`, `>1`. */
export function formatLabRange(
  low: number | null,
  high: number | null,
  text: string | null,
): string {
  if (low !== null && high !== null) {
    return `${low}–${high}`;
  }
  if (high !== null) {
    return `<${high}`;
  }
  if (low !== null) {
    return `>${low}`;
  }
  return text ?? '';
}
