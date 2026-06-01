/**
 * MDE Scoring Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is the single source of truth for all instrument scoring rules.
 * It is version-controlled in GitHub — every change creates an auditable
 * commit with timestamp and author.
 *
 * PROMIS-29 v2.1 lookup tables are transcribed from:
 *   HealthMeasures PROMIS Adult Profile Instruments Scoring Manual
 *   Published: April 9, 2021
 *   Source: healthmeasures.net
 *
 * PHQ-9: Kroenke K, Spitzer RL, Williams JBW. J Gen Intern Med. 2001.
 * GAD-7: Spitzer RL et al. Arch Intern Med. 2006.
 * TSK-11: Woby SR et al. Pain. 2005.
 * PCS: Sullivan MJL et al. Psychological Assessment. 1995.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoreResult {
  rawScore:       number
  tScore?:        number   // PROMIS only
  standardError?: number   // PROMIS only
  totalScore?:    number   // non-PROMIS
  severityLabel:  string
  interpretation: string
  subscaleScores?: Record<string, number>
}

interface PromisLookupEntry { t: number; se: number }
type PromisLookupTable = Record<number, PromisLookupEntry>

interface SeverityBand {
  min: number; max: number; label: string; interpretation: string
}

// ── PROMIS T-Score Lookup Tables (PROMIS-29 v2.1) ────────────────────────────
// Source: Appendix, pages 25-26 of scoring manual

const PROMIS_PHYSICAL_FUNCTION_4A: PromisLookupTable = {
   4: { t: 22.5, se: 4.0 },  5: { t: 26.6, se: 2.8 },
   6: { t: 28.9, se: 2.5 },  7: { t: 30.5, se: 2.4 },
   8: { t: 31.9, se: 2.3 },  9: { t: 33.2, se: 2.3 },
  10: { t: 34.4, se: 2.3 }, 11: { t: 35.6, se: 2.3 },
  12: { t: 36.7, se: 2.3 }, 13: { t: 37.9, se: 2.4 },
  14: { t: 39.2, se: 2.4 }, 15: { t: 40.5, se: 2.4 },
  16: { t: 41.9, se: 2.5 }, 17: { t: 43.5, se: 2.6 },
  18: { t: 45.5, se: 2.8 }, 19: { t: 48.3, se: 3.3 },
  20: { t: 57.0, se: 6.6 },
}

const PROMIS_ANXIETY_4A: PromisLookupTable = {
   4: { t: 40.3, se: 6.1 },  5: { t: 48.0, se: 3.6 },
   6: { t: 51.2, se: 3.1 },  7: { t: 53.7, se: 2.8 },
   8: { t: 55.8, se: 2.7 },  9: { t: 57.7, se: 2.6 },
  10: { t: 59.5, se: 2.6 }, 11: { t: 61.4, se: 2.6 },
  12: { t: 63.4, se: 2.6 }, 13: { t: 65.3, se: 2.7 },
  14: { t: 67.3, se: 2.7 }, 15: { t: 69.3, se: 2.7 },
  16: { t: 71.2, se: 2.7 }, 17: { t: 73.3, se: 2.7 },
  18: { t: 75.4, se: 2.7 }, 19: { t: 77.9, se: 2.9 },
  20: { t: 81.6, se: 3.7 },
}

const PROMIS_DEPRESSION_4A: PromisLookupTable = {
   4: { t: 41.0, se: 6.2 },  5: { t: 49.0, se: 3.2 },
   6: { t: 51.8, se: 2.7 },  7: { t: 53.9, se: 2.4 },
   8: { t: 55.7, se: 2.3 },  9: { t: 57.3, se: 2.3 },
  10: { t: 58.9, se: 2.3 }, 11: { t: 60.5, se: 2.3 },
  12: { t: 62.2, se: 2.3 }, 13: { t: 63.9, se: 2.3 },
  14: { t: 65.7, se: 2.3 }, 15: { t: 67.5, se: 2.3 },
  16: { t: 69.4, se: 2.3 }, 17: { t: 71.2, se: 2.4 },
  18: { t: 73.3, se: 2.4 }, 19: { t: 75.7, se: 2.6 },
  20: { t: 79.4, se: 3.6 },
}

const PROMIS_FATIGUE_4A: PromisLookupTable = {
   4: { t: 33.7, se: 4.9 },  5: { t: 39.7, se: 3.1 },
   6: { t: 43.1, se: 2.7 },  7: { t: 46.0, se: 2.6 },
   8: { t: 48.6, se: 2.5 },  9: { t: 51.0, se: 2.5 },
  10: { t: 53.1, se: 2.4 }, 11: { t: 55.1, se: 2.4 },
  12: { t: 57.0, se: 2.3 }, 13: { t: 58.8, se: 2.3 },
  14: { t: 60.7, se: 2.3 }, 15: { t: 62.7, se: 2.4 },
  16: { t: 64.6, se: 2.4 }, 17: { t: 66.7, se: 2.4 },
  18: { t: 69.0, se: 2.5 }, 19: { t: 71.6, se: 2.7 },
  20: { t: 75.8, se: 3.9 },
}

const PROMIS_SLEEP_4A: PromisLookupTable = {
   4: { t: 32.0, se: 5.2 },  5: { t: 37.5, se: 4.0 },
   6: { t: 41.1, se: 3.7 },  7: { t: 43.8, se: 3.5 },
   8: { t: 46.2, se: 3.5 },  9: { t: 48.4, se: 3.4 },
  10: { t: 50.5, se: 3.4 }, 11: { t: 52.4, se: 3.4 },
  12: { t: 54.3, se: 3.4 }, 13: { t: 56.1, se: 3.4 },
  14: { t: 57.9, se: 3.3 }, 15: { t: 59.8, se: 3.3 },
  16: { t: 61.7, se: 3.3 }, 17: { t: 63.8, se: 3.4 },
  18: { t: 66.0, se: 3.4 }, 19: { t: 68.8, se: 3.7 },
  20: { t: 73.3, se: 4.6 },
}

const PROMIS_SOCIAL_4A: PromisLookupTable = {
   4: { t: 27.5, se: 4.1 },  5: { t: 31.8, se: 2.5 },
   6: { t: 34.0, se: 2.3 },  7: { t: 35.7, se: 2.2 },
   8: { t: 37.3, se: 2.1 },  9: { t: 38.8, se: 2.2 },
  10: { t: 40.5, se: 2.3 }, 11: { t: 42.3, se: 2.3 },
  12: { t: 44.2, se: 2.3 }, 13: { t: 46.2, se: 2.3 },
  14: { t: 48.1, se: 2.2 }, 15: { t: 50.0, se: 2.2 },
  16: { t: 51.9, se: 2.2 }, 17: { t: 53.7, se: 2.3 },
  18: { t: 55.8, se: 2.3 }, 19: { t: 58.3, se: 2.7 },
  20: { t: 64.2, se: 5.1 },
}

const PROMIS_PAIN_INTERFERENCE_4A: PromisLookupTable = {
   4: { t: 41.6, se: 6.1 },  5: { t: 49.6, se: 2.5 },
   6: { t: 52.0, se: 2.0 },  7: { t: 53.9, se: 1.9 },
   8: { t: 55.6, se: 1.9 },  9: { t: 57.1, se: 1.9 },
  10: { t: 58.5, se: 1.8 }, 11: { t: 59.9, se: 1.8 },
  12: { t: 61.2, se: 1.8 }, 13: { t: 62.5, se: 1.8 },
  14: { t: 63.8, se: 1.8 }, 15: { t: 65.2, se: 1.8 },
  16: { t: 66.6, se: 1.8 }, 17: { t: 68.0, se: 1.8 },
  18: { t: 69.7, se: 1.9 }, 19: { t: 71.6, se: 2.1 },
  20: { t: 75.6, se: 3.7 },
}

// ── PROMIS Severity Cut Points (healthmeasures.net) ───────────────────────────

/** For symptom scales: higher T = more symptoms (worse) */
const PROMIS_SYMPTOM_BANDS: SeverityBand[] = [
  { min: 0,  max: 54.9, label: 'Within Normal Limits', interpretation: 'Average or better than average for the US general population' },
  { min: 55, max: 59.9, label: 'Mild',                 interpretation: 'Slightly worse than average' },
  { min: 60, max: 69.9, label: 'Moderate',             interpretation: 'Moderately worse than average' },
  { min: 70, max: 999,  label: 'Severe',               interpretation: 'Significantly worse than average' },
]

/** For function scales: higher T = better function */
const PROMIS_FUNCTION_BANDS: SeverityBand[] = [
  { min: 45,  max: 999, label: 'Within Normal Limits', interpretation: 'Average or better than average for the US general population' },
  { min: 40,  max: 44.9, label: 'Mild limitation',     interpretation: 'Slightly below average' },
  { min: 30,  max: 39.9, label: 'Moderate limitation', interpretation: 'Moderately below average' },
  { min: 0,   max: 29.9, label: 'Severe limitation',   interpretation: 'Significantly below average' },
]

// ── Scoring helpers ───────────────────────────────────────────────────────────

function scorePromis(
  responses: Record<string, number>,
  table: PromisLookupTable,
  higherIsBetter: boolean
): ScoreResult {
  const values = Object.values(responses).filter(v => v !== null && v !== undefined)
  if (values.length === 0) throw new Error('No responses provided')
  const rawScore = values.reduce((a, b) => a + b, 0)
  const entry = table[rawScore]
  if (!entry) throw new Error(`No lookup entry for raw score ${rawScore}`)
  const bands = higherIsBetter ? PROMIS_FUNCTION_BANDS : PROMIS_SYMPTOM_BANDS
  const band = bands.find(b =>
    higherIsBetter
      ? entry.t >= b.min && entry.t <= b.max
      : entry.t >= b.min && entry.t <= b.max
  ) ?? bands[bands.length - 1]
  return {
    rawScore,
    tScore:        entry.t,
    standardError: entry.se,
    severityLabel:  band.label,
    interpretation: band.interpretation,
  }
}

function findBand(score: number, bands: SeverityBand[]): SeverityBand {
  return bands.find(b => score >= b.min && score <= b.max) ?? bands[bands.length - 1]
}

// ── Instrument Scoring Functions ──────────────────────────────────────────────

export function scorePhysicalFunction(responses: Record<string, number>): ScoreResult {
  return scorePromis(responses, PROMIS_PHYSICAL_FUNCTION_4A, true)
}

export function scoreAnxiety(responses: Record<string, number>): ScoreResult {
  return scorePromis(responses, PROMIS_ANXIETY_4A, false)
}

export function scoreDepression(responses: Record<string, number>): ScoreResult {
  return scorePromis(responses, PROMIS_DEPRESSION_4A, false)
}

export function scoreFatigue(responses: Record<string, number>): ScoreResult {
  return scorePromis(responses, PROMIS_FATIGUE_4A, false)
}

export function scoreSleep(responses: Record<string, number>): ScoreResult {
  return scorePromis(responses, PROMIS_SLEEP_4A, false)
}

export function scoreSocialRoles(responses: Record<string, number>): ScoreResult {
  return scorePromis(responses, PROMIS_SOCIAL_4A, true)
}

export function scorePainInterference(responses: Record<string, number>): ScoreResult {
  return scorePromis(responses, PROMIS_PAIN_INTERFERENCE_4A, false)
}

export function scoreGIC(responses: Record<string, number>): ScoreResult {
  const val = responses['gic_1'] ?? 0
  const label = val <= 3 ? 'Improved' : val === 4 ? 'No Change' : 'Worse'
  const interp = val <= 3
    ? 'Patient reports overall improvement since starting the program'
    : val === 4
    ? 'Patient reports no overall change since starting the program'
    : 'Patient reports overall worsening since starting the program'
  return { rawScore: val, totalScore: val, severityLabel: label, interpretation: interp }
}

export function scorePainNRS(responses: Record<string, number>): ScoreResult {
  const score = responses['nrs'] ?? 0
  const label = score <= 3 ? 'Mild' : score <= 6 ? 'Moderate' : 'Severe'
  return { rawScore: score, totalScore: score, severityLabel: label, interpretation: `${score}/10` }
}

export function scorePHQ9(responses: Record<string, number>): ScoreResult {
  const PHQ9_BANDS: SeverityBand[] = [
    { min: 0,  max: 4,  label: 'None–Minimal',       interpretation: 'No treatment likely required' },
    { min: 5,  max: 9,  label: 'Mild',               interpretation: 'Watchful waiting' },
    { min: 10, max: 14, label: 'Moderate',            interpretation: 'Treatment plan recommended' },
    { min: 15, max: 19, label: 'Moderately Severe',   interpretation: 'Active treatment recommended' },
    { min: 20, max: 27, label: 'Severe',              interpretation: 'Immediate evaluation recommended' },
  ]
  const total = Object.values(responses).reduce((a, b) => a + b, 0)
  const band  = findBand(total, PHQ9_BANDS)
  return { rawScore: total, totalScore: total, severityLabel: band.label, interpretation: band.interpretation }
}

export function scoreGAD7(responses: Record<string, number>): ScoreResult {
  const GAD7_BANDS: SeverityBand[] = [
    { min: 0,  max: 4,  label: 'Minimal',  interpretation: 'Minimal anxiety' },
    { min: 5,  max: 9,  label: 'Mild',     interpretation: 'Mild anxiety' },
    { min: 10, max: 14, label: 'Moderate', interpretation: 'Moderate anxiety' },
    { min: 15, max: 21, label: 'Severe',   interpretation: 'Severe anxiety' },
  ]
  const total = Object.values(responses).reduce((a, b) => a + b, 0)
  const band  = findBand(total, GAD7_BANDS)
  return { rawScore: total, totalScore: total, severityLabel: band.label, interpretation: band.interpretation }
}

export function scoreTSK11(responses: Record<string, number>): ScoreResult {
  // TSK-11 (Woby et al. 2005) - no reverse scoring in this 11-item version
  // All items scored 1=Strongly Disagree to 4=Strongly Agree
  // Range: 11-44
  let total = 0
  for (const [key, val] of Object.entries(responses)) {
    total += val
  }
  const elevated = total >= 37
  return {
    rawScore:      total,
    totalScore:    total,
    severityLabel:  elevated ? 'Elevated' : 'Within Normal Range',
    interpretation: elevated
      ? 'Score >= 37 indicates elevated kinesiophobia. Associated with avoidance behavior and poorer rehabilitation outcomes.'
      : 'Score < 37. Kinesiophobia within normal range.',
  }
}

export function scorePCS(responses: Record<string, number>): ScoreResult {
  // Subscales:
  // Rumination:   items 8, 9, 10, 11
  // Magnification: items 6, 7, 13
  // Helplessness: items 1, 2, 3, 4, 5, 12
  const RUMINATION    = ['pcs_8','pcs_9','pcs_10','pcs_11']
  const MAGNIFICATION = ['pcs_6','pcs_7','pcs_13']
  const HELPLESSNESS  = ['pcs_1','pcs_2','pcs_3','pcs_4','pcs_5','pcs_12']

  const total = Object.values(responses).reduce((a, b) => a + b, 0)
  const rumination    = RUMINATION.reduce((s, k)    => s + (responses[k] ?? 0), 0)
  const magnification = MAGNIFICATION.reduce((s, k) => s + (responses[k] ?? 0), 0)
  const helplessness  = HELPLESSNESS.reduce((s, k)  => s + (responses[k] ?? 0), 0)

  const elevated = total >= 30
  return {
    rawScore:      total,
    totalScore:    total,
    severityLabel:  elevated ? 'Clinically Significant' : 'Below Clinical Threshold',
    interpretation: elevated
      ? 'Score >= 30 is clinically significant. Associated with greater pain-related disability.'
      : 'Score < 30. Below clinical threshold for pain catastrophizing.',
    subscaleScores: { rumination, magnification, helplessness },
  }
}

// ── Main scoring dispatcher ───────────────────────────────────────────────────

export const SCORING_FUNCTIONS: Record<string, (r: Record<string, number>) => ScoreResult> = {
  promis_physical_function_4a_v2: scorePhysicalFunction,
  promis_anxiety_4a_v1:           scoreAnxiety,
  promis_depression_4a_v1:        scoreDepression,
  promis_fatigue_4a_v1:           scoreFatigue,
  promis_sleep_4a_v1:             scoreSleep,
  promis_social_4a_v1:            scoreSocialRoles,
  promis_pain_interference_4a_v1: scorePainInterference,
  gic:                            scoreGIC,
  pain_nrs:                       scorePainNRS,
  phq9:                           scorePHQ9,
  gad7:                           scoreGAD7,
  tsk11:                          scoreTSK11,
  pcs:                            scorePCS,
}

interface DynamicScoringConfig {
  type: string
  higherIsBetter?: boolean
  maxScore?: number
  severityBands?: { max?: number; label: string; interpretation: string }[]
}

function scoreDynamic(responses: Record<string, number>, config: DynamicScoringConfig): ScoreResult {
  const rawScore = Object.values(responses).reduce((a, b) => a + b, 0)
  const band = config.severityBands?.find(b => b.max == null || rawScore <= b.max)
  return {
    rawScore,
    totalScore: rawScore,
    severityLabel:  band?.label ?? '',
    interpretation: band?.interpretation ?? '',
  }
}

export function scoreInstrument(
  scoringConfigKey: string,
  responses: Record<string, number>,
  instrument?: { scoring_config?: DynamicScoringConfig | null }
): ScoreResult {
  if (instrument?.scoring_config?.type === 'sum') {
    return scoreDynamic(responses, instrument.scoring_config)
  }
  const fn = SCORING_FUNCTIONS[scoringConfigKey]
  if (!fn) throw new Error(`Unknown scoring config key: ${scoringConfigKey}`)
  return fn(responses)
}

// ── Instrument metadata (used by UI and reports) ──────────────────────────────

export const INSTRUMENT_META: Record<string, {
  displayName: string
  shortName:   string
  higherIsBetter: boolean
  isPromis:    boolean
  maxScore:    number
  citation:    string
}> = {
  promis_physical_function_4a_v2: {
    displayName:    'Physical Function',
    shortName:      'Phys Fn',
    higherIsBetter: true,
    isPromis:       true,
    maxScore:       20,
    citation:       'PROMIS-29 v2.1 Profile — Adult v2.0 Physical Function 4a. HealthMeasures, 2021.',
  },
  promis_anxiety_4a_v1: {
    displayName:    'Anxiety',
    shortName:      'Anxiety',
    higherIsBetter: false,
    isPromis:       true,
    maxScore:       20,
    citation:       'PROMIS-29 v2.1 Profile — Adult v1.0 Anxiety 4a. HealthMeasures, 2021.',
  },
  promis_depression_4a_v1: {
    displayName:    'Depression',
    shortName:      'Depression',
    higherIsBetter: false,
    isPromis:       true,
    maxScore:       20,
    citation:       'PROMIS-29 v2.1 Profile — Adult v1.0 Depression 4a. HealthMeasures, 2021.',
  },
  promis_fatigue_4a_v1: {
    displayName:    'Fatigue',
    shortName:      'Fatigue',
    higherIsBetter: false,
    isPromis:       true,
    maxScore:       20,
    citation:       'PROMIS-29 v2.1 Profile — Adult v1.0 Fatigue 4a. HealthMeasures, 2021.',
  },
  promis_sleep_4a_v1: {
    displayName:    'Sleep Disturbance',
    shortName:      'Sleep',
    higherIsBetter: false,
    isPromis:       true,
    maxScore:       20,
    citation:       'PROMIS-29 v2.1 Profile — Adult v1.0 Sleep Disturbance 4a. HealthMeasures, 2021.',
  },
  promis_social_4a_v1: {
    displayName:    'Ability to Participate in Social Roles & Activities',
    shortName:      'Social Roles',
    higherIsBetter: true,
    isPromis:       true,
    maxScore:       20,
    citation:       'PROMIS-29 v2.1 Profile — Adult v1.0 Ability to Participate in Social Roles and Activities 4a. HealthMeasures, 2021.',
  },
  promis_pain_interference_4a_v1: {
    displayName:    'Pain Interference',
    shortName:      'Pain Int.',
    higherIsBetter: false,
    isPromis:       true,
    maxScore:       20,
    citation:       'PROMIS-29 v2.1 Profile — Adult v1.0 Pain Interference 4a. HealthMeasures, 2021.',
  },
  pain_nrs: {
    displayName:    'Pain Intensity (NRS)',
    shortName:      'Pain NRS',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       10,
    citation:       'Numeric Rating Scale for Pain Intensity. PROMIS Pain Intensity item (Global07).',
  },
  phq9: {
    displayName:    'PHQ-9 Depression',
    shortName:      'PHQ-9',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       27,
    citation:       'Kroenke K, Spitzer RL, Williams JBW. The PHQ-9. J Gen Intern Med. 2001;16(9):606-613.',
  },
  gad7: {
    displayName:    'GAD-7 Anxiety',
    shortName:      'GAD-7',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       21,
    citation:       'Spitzer RL, Kroenke K, Williams JBW, Lowe B. Arch Intern Med. 2006;166(10):1092-1097.',
  },
  tsk11: {
    displayName:    'Tampa Scale for Kinesiophobia (TSK-11)',
    shortName:      'TSK-11',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       44,
    citation:       'Woby SR, Roach NK, Urmston M, Watson PJ. Pain. 2005;115(3):380-386.',
  },
  pcs: {
    displayName:    'Pain Catastrophizing Scale (PCS)',
    shortName:      'PCS',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       52,
    citation:       'Sullivan MJL, Bishop SR, Pivik J. Psychological Assessment. 1995;7(4):524-532.',
  },
  gic: {
    displayName:    'Global Impression of Change',
    shortName:      'GIC',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       7,
    citation:       'Patient Global Impression of Change. Single-item scale for overall perceived change since treatment initiation.',
  },
}
