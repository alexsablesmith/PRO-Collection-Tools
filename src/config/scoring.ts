/**
 * Prolix Health Scoring Configuration
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

// ── Regional & functional instruments (item bank, July 2026) ─────────────────

const sumValues = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
const round1 = (n: number) => Math.round(n * 10) / 10

/** Sum selected keys, treating missing as 0 */
const sumKeys = (r: Record<string, number>, keys: string[]) =>
  keys.reduce((s, k) => s + (r[k] ?? 0), 0)

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`)

export function scoreODI(responses: Record<string, number>): ScoreResult {
  // Fairbank & Pynsent 2000. Sections 0–5; skipped sections (e.g. sex life)
  // reduce the denominator: score = sum / (5 × answered) × 100.
  const answered = Object.values(responses).filter(v => v !== null && v !== undefined)
  if (answered.length === 0) throw new Error('No responses provided')
  const raw = answered.reduce((a, b) => a + b, 0)
  const pctScore = round1((raw / (answered.length * 5)) * 100)
  const ODI_BANDS: SeverityBand[] = [
    { min: 0,  max: 20,  label: 'Minimal disability',  interpretation: 'Can cope with most activities of daily living' },
    { min: 21, max: 40,  label: 'Moderate disability', interpretation: 'More pain and difficulty with sitting, lifting, and standing' },
    { min: 41, max: 60,  label: 'Severe disability',   interpretation: 'Pain is a primary problem; ADLs are affected' },
    { min: 61, max: 80,  label: 'Crippling back pain', interpretation: 'Back pain impinges on all aspects of life' },
    { min: 81, max: 100, label: 'Bed-bound or exaggerating', interpretation: 'Patient is bed-bound or symptom exaggeration should be considered' },
  ]
  const band = findBand(pctScore, ODI_BANDS)
  return { rawScore: raw, totalScore: pctScore, severityLabel: band.label, interpretation: band.interpretation }
}

export function scoreNDI(responses: Record<string, number>): ScoreResult {
  // Vernon & Mior 1991. Raw 0–50.
  const raw = sumValues(responses)
  const NDI_BANDS: SeverityBand[] = [
    { min: 0,  max: 4,  label: 'No disability',       interpretation: 'No significant activity limitation from neck pain' },
    { min: 5,  max: 14, label: 'Mild disability',     interpretation: 'Mild limitation of daily activities' },
    { min: 15, max: 24, label: 'Moderate disability', interpretation: 'Moderate limitation of daily activities' },
    { min: 25, max: 34, label: 'Severe disability',   interpretation: 'Severe limitation of daily activities' },
    { min: 35, max: 50, label: 'Complete disability', interpretation: 'Complete activity limitation from neck pain' },
  ]
  const band = findBand(raw, NDI_BANDS)
  return { rawScore: raw, totalScore: raw, severityLabel: band.label, interpretation: band.interpretation }
}

function scoreDashLike(responses: Record<string, number>, nItems: number, minAnswered: number): ScoreResult {
  // IWH scoring: ((mean of items) − 1) × 25 → 0 (no disability) to 100.
  // A score is not valid unless at least minAnswered items are answered
  // (DASH: 27 of 30; QuickDASH: 10 of 11).
  const values = Object.values(responses).filter(v => v !== null && v !== undefined)
  if (values.length < minAnswered) {
    throw new Error(`At least ${minAnswered} of ${nItems} items must be answered to score (got ${values.length})`)
  }
  const raw = values.reduce((a, b) => a + b, 0)
  const score = round1(((raw / values.length) - 1) * 25)
  return {
    rawScore: raw,
    totalScore: score,
    severityLabel: '',
    interpretation: `0 = no disability, 100 = most severe disability (${values.length}/${nItems} items answered)`,
  }
}

export const scoreDASH      = (r: Record<string, number>) => scoreDashLike(r, 30, 27)
export const scoreQuickDASH = (r: Record<string, number>) => scoreDashLike(r, 11, 10)

/**
 * KOOS/HOOS subscale: 100 − mean(items 0–4) × 25 → 0 (worst) to 100 (best).
 * Per the KOOS/HOOS manual, a subscale is not scored (NaN) when more than
 * 50% of its items are missing.
 */
function koosSubscale(responses: Record<string, number>, keys: string[]): number {
  const vals = keys.map(k => responses[k]).filter(v => v !== null && v !== undefined)
  if (vals.length < keys.length / 2) return NaN
  return round1(100 - (vals.reduce((a, b) => a + b, 0) / vals.length) * 25)
}

function scoreKoosLike(
  responses: Record<string, number>,
  prefix: string,
  ranges: Record<string, [number, number]>
): ScoreResult {
  const subscaleScores: Record<string, number> = {}
  for (const [name, [from, to]] of Object.entries(ranges)) {
    const s = koosSubscale(responses, range(`${prefix}_`, from, to))
    if (!isNaN(s)) subscaleScores[name] = s
  }
  const raw = sumValues(responses)
  const subs = Object.values(subscaleScores)
  const total = subs.length ? round1(subs.reduce((a, b) => a + b, 0) / subs.length) : 0
  return {
    rawScore: raw,
    totalScore: total,
    severityLabel: '',
    interpretation: 'Subscales 0 (extreme problems) to 100 (no problems); total is the mean of subscales',
    subscaleScores,
  }
}

// Subscale ranges follow the item order in the PROM database spreadsheet
export const scoreKOOS = (r: Record<string, number>) => scoreKoosLike(r, 'koos', {
  symptoms: [1, 7], pain: [8, 16], adl: [17, 33], sport_rec: [34, 38], qol: [39, 42],
})
// Official HOOS (Nilsdotter 2003): Symptoms 5, Pain 10, ADL 17, Sport/Rec 4, QOL 4
export const scoreHOOS = (r: Record<string, number>) => scoreKoosLike(r, 'hoos', {
  symptoms: [1, 5], pain: [6, 15], adl: [16, 32], sport_rec: [33, 36], qol: [37, 40],
})

export function scoreWOMAC(responses: Record<string, number>): ScoreResult {
  // Bellamy 1988. Items 0–4; total 0–96, higher = worse.
  const raw = sumValues(responses)
  return {
    rawScore: raw,
    totalScore: raw,
    severityLabel: '',
    interpretation: '0 (no symptoms) to 96 (most severe)',
    subscaleScores: {
      pain:      sumKeys(responses, range('womac_', 1, 5)),
      stiffness: sumKeys(responses, range('womac_', 6, 7)),
      function:  sumKeys(responses, range('womac_', 8, 24)),
    },
  }
}

export function scoreLEFS(responses: Record<string, number>): ScoreResult {
  // Binkley 1999. Sum 0–80, higher = better function. MCID = 9 points.
  const raw = sumValues(responses)
  const pct = round1((raw / 80) * 100)
  return {
    rawScore: raw,
    totalScore: raw,
    severityLabel: '',
    interpretation: `${pct}% of maximal function (80 = no limitation; MCID 9 points)`,
  }
}

export function scoreFAAM(responses: Record<string, number>): ScoreResult {
  // Martin 2005. ADL items 1–21 (/84), Sports items 22–29 (/32), each as %.
  const adlKeys   = range('faam_', 1, 21).filter(k => responses[k] !== undefined)
  const sportKeys = range('faam_', 22, 29).filter(k => responses[k] !== undefined)
  const adlPct   = adlKeys.length   ? round1((sumKeys(responses, adlKeys)   / (adlKeys.length * 4))   * 100) : NaN
  const sportPct = sportKeys.length ? round1((sumKeys(responses, sportKeys) / (sportKeys.length * 4)) * 100) : NaN
  return {
    rawScore: sumValues(responses),
    totalScore: isNaN(adlPct) ? 0 : adlPct,
    severityLabel: '',
    interpretation: '100% = full function; ADL subscale is the primary score',
    subscaleScores: {
      ...(isNaN(adlPct)   ? {} : { adl: adlPct }),
      ...(isNaN(sportPct) ? {} : { sports: sportPct }),
    },
  }
}

export function scoreHAQDI(responses: Record<string, number>): ScoreResult {
  // Fries 1980. Highest score in each of 8 categories, averaged → 0–3.
  const CATEGORIES: [string, string[]][] = [
    ['Dressing & grooming', range('haq_di_', 1, 2)],
    ['Arising',             range('haq_di_', 3, 4)],
    ['Eating',              range('haq_di_', 5, 7)],
    ['Walking',             range('haq_di_', 8, 9)],
    ['Hygiene',             range('haq_di_', 10, 12)],
    ['Reach',               range('haq_di_', 13, 14)],
    ['Grip',                range('haq_di_', 15, 17)],
    ['Common activities',   range('haq_di_', 18, 20)],
  ]
  const maxima = CATEGORIES.map(([, keys]) =>
    Math.max(...keys.map(k => responses[k] ?? 0)))
  const score = Math.round((maxima.reduce((a, b) => a + b, 0) / CATEGORIES.length) * 100) / 100
  const label = score <= 1 ? 'Mild difficulty' : score <= 2 ? 'Moderate difficulty' : 'Severe difficulty'
  return {
    rawScore: sumValues(responses),
    totalScore: score,
    severityLabel: label,
    interpretation: 'Mean of highest score per category: 0 (no difficulty) to 3 (unable)',
  }
}

// UW-CAP 6-item short form: summary score (6–30) → IRT-based T-score.
// Source: UW Concerns About Pain (UW-CAP) v1.0 User Guide, 6-item conversion table.
const UW_CAP_6ITEM_TSCORE: Record<number, number> = {
   6: 30.8,  7: 35.3,  8: 38.7,  9: 41.6, 10: 44.1, 11: 46.2, 12: 48.1, 13: 49.7,
  14: 51.2, 15: 52.6, 16: 54.0, 17: 55.4, 18: 56.8, 19: 58.2, 20: 59.6, 21: 61.1,
  22: 62.5, 23: 64.0, 24: 65.5, 25: 67.0, 26: 68.7, 27: 70.5, 28: 72.5, 29: 74.9,
  30: 78.1,
}

export function scoreUWPain(responses: Record<string, number>): ScoreResult {
  // UW-CAP 6-item: each item 1–5. The raw sum is NOT interpretable on its own;
  // it is converted to an IRT-based T-score (mean 50, SD 10; higher = more pain
  // catastrophizing). Per the user guide a score can be produced when at least
  // 4 of 6 items are answered, pro-rating the sum: (raw × 6) / answered, rounded
  // up. More than two missing → not scorable.
  const vals = Object.values(responses).filter(v => v !== null && v !== undefined)
  const nAnswered = vals.length
  if (nAnswered < 4) {
    throw new Error(`At least 4 of 6 UW-CAP items must be answered to score (got ${nAnswered})`)
  }
  const rawSum = vals.reduce((a, b) => a + b, 0)
  const summaryScore = nAnswered < 6 ? Math.ceil((rawSum * 6) / nAnswered) : rawSum
  const tScore = UW_CAP_6ITEM_TSCORE[summaryScore]
  if (tScore == null) throw new Error(`No UW-CAP T-score for summary score ${summaryScore}`)

  // Cut points from the user guide: T=52 ≈ PCS 20 (moderate risk), T=57 ≈ PCS 30 (high risk)
  let severityLabel: string, interpretation: string
  if (tScore < 52) {
    severityLabel  = 'Below clinical threshold'
    interpretation = 'Pain catastrophizing below the moderate-risk cut point (T<52)'
  } else if (tScore < 57) {
    severityLabel  = 'Moderate concern'
    interpretation = 'Moderate risk for prolonged pain and disability (T 52–56; ≈ PCS ≥20)'
  } else {
    severityLabel  = 'High concern'
    interpretation = 'High risk for prolonged pain and disability (T≥57; ≈ PCS ≥30)'
  }

  return {
    rawScore:   rawSum,
    tScore,
    totalScore: tScore,   // mirror into total_score so raw-score UIs still show the T-score
    severityLabel,
    interpretation,
  }
}

// ── ADL Functional Assessment battery (Sept 2026) ─────────────────────────────
// Three intact published short forms administered "ask once": three items are
// shown only in the PF SF 20a step but feed more than one form's raw score
//   PFA55, PFB26 → PF 20a + Neuro-QOL UE
//   PFA34        → PF 20a + UE 7a
// So each form is scored from its full published item set pulled out of the
// merged response pool (see src/pages/api/survey/[token]/submit.ts), not just
// the items rendered under its own step.
//
// Raw-score → T-score lookup tables are transcribed from the published manuals:
//   PROMIS PF SF 20a, UE SF 7a — HealthMeasures PROMIS scoring manual
//   Neuro-QOL UE Fine Motor/ADL SF — Neuro-QOL scoring manual, Table 7d
// Item keys are the published PROMIS/Neuro-QOL Item IDs.

export const PF_SF20A_ITEMS = [
  'PFA16r1','PFA55','PFA34','PFA38','PFB26','PFC45r1','PFC46','PFA51','PFC36r1','PFB24',
  'PFC37','PFA1','PFA3','PFC12','PFA11','PFA5','PFA12','PFB19r1','PFB22','PFA56',
]
export const UE_SF7A_ITEMS = ['PFA36','PFA34','PFA14r1','PFB13','PFB28r1','PFB34','PFM16r']
export const NEUROQOL_UE_ITEMS = ['PFA35','PFA55','PFB26','PFA50','PFA43','NQUEX44','PFA40','PFB21']

/** Item keys that make up each fixed-form raw score, in published order. */
export const FORM_COMPOSITIONS: Record<string, string[]> = {
  promis_pf_sf20a: PF_SF20A_ITEMS,
  promis_ue_sf7a:  UE_SF7A_ITEMS,
  neuroqol_ue_sf:  NEUROQOL_UE_ITEMS,
}

/** Forms whose score must be computed from the merged pool, not one step. */
export const CROSS_FORM_SCORING_KEYS = new Set(Object.keys(FORM_COMPOSITIONS))

// PROMIS Adult v2.0 Physical Function 20a Short Form Conversion Table.
// Source: PROMIS Physical Function User Manual & Scoring Instructions
// (24 Nov 2025), Appendix 1, p. 25. Items coded 5 = Without any difficulty ..
// 1 = Cannot do / Unable; higher raw = better function. The published table
// runs raw 20–99; an all-"without difficulty" respondent sums to 100, which
// is clamped to the raw-99 ceiling by scoreFixedForm (maximum measurable).
const PROMIS_PF_SF20A: PromisLookupTable = {
  20: { t:  9.2, se: 3.2 }, 21: { t: 11.7, se: 2.5 }, 22: { t: 13.2, se: 2.3 },
  23: { t: 14.3, se: 2.1 }, 24: { t: 15.3, se: 2.0 }, 25: { t: 16.2, se: 1.9 },
  26: { t: 16.9, se: 1.9 }, 27: { t: 17.6, se: 1.8 }, 28: { t: 18.3, se: 1.8 },
  29: { t: 18.9, se: 1.7 }, 30: { t: 19.5, se: 1.7 }, 31: { t: 20.1, se: 1.7 },
  32: { t: 20.6, se: 1.7 }, 33: { t: 21.2, se: 1.6 }, 34: { t: 21.7, se: 1.6 },
  35: { t: 22.2, se: 1.6 }, 36: { t: 22.6, se: 1.6 }, 37: { t: 23.1, se: 1.6 },
  38: { t: 23.6, se: 1.6 }, 39: { t: 24.1, se: 1.5 }, 40: { t: 24.5, se: 1.5 },
  41: { t: 24.9, se: 1.5 }, 42: { t: 25.4, se: 1.5 }, 43: { t: 25.8, se: 1.5 },
  44: { t: 26.2, se: 1.5 }, 45: { t: 26.7, se: 1.5 }, 46: { t: 27.1, se: 1.4 },
  47: { t: 27.5, se: 1.4 }, 48: { t: 27.9, se: 1.4 }, 49: { t: 28.3, se: 1.5 },
  50: { t: 28.7, se: 1.5 }, 51: { t: 29.2, se: 1.4 }, 52: { t: 29.6, se: 1.4 },
  53: { t: 30.0, se: 1.4 }, 54: { t: 30.3, se: 1.4 }, 55: { t: 30.7, se: 1.4 },
  56: { t: 31.2, se: 1.4 }, 57: { t: 31.6, se: 1.4 }, 58: { t: 32.0, se: 1.4 },
  59: { t: 32.4, se: 1.3 }, 60: { t: 32.7, se: 1.3 }, 61: { t: 33.1, se: 1.4 },
  62: { t: 33.5, se: 1.4 }, 63: { t: 33.9, se: 1.4 }, 64: { t: 34.4, se: 1.4 },
  65: { t: 34.8, se: 1.3 }, 66: { t: 35.1, se: 1.3 }, 67: { t: 35.5, se: 1.3 },
  68: { t: 35.9, se: 1.4 }, 69: { t: 36.3, se: 1.4 }, 70: { t: 36.8, se: 1.4 },
  71: { t: 37.2, se: 1.3 }, 72: { t: 37.6, se: 1.3 }, 73: { t: 38.0, se: 1.3 },
  74: { t: 38.4, se: 1.4 }, 75: { t: 38.8, se: 1.4 }, 76: { t: 39.3, se: 1.4 },
  77: { t: 39.7, se: 1.4 }, 78: { t: 40.2, se: 1.4 }, 79: { t: 40.6, se: 1.4 },
  80: { t: 41.1, se: 1.5 }, 81: { t: 41.6, se: 1.5 }, 82: { t: 42.1, se: 1.5 },
  83: { t: 42.6, se: 1.5 }, 84: { t: 43.1, se: 1.5 }, 85: { t: 43.7, se: 1.6 },
  86: { t: 44.2, se: 1.6 }, 87: { t: 44.8, se: 1.6 }, 88: { t: 45.4, se: 1.7 },
  89: { t: 46.1, se: 1.7 }, 90: { t: 46.8, se: 1.8 }, 91: { t: 47.5, se: 1.8 },
  92: { t: 48.3, se: 1.9 }, 93: { t: 49.2, se: 2.1 }, 94: { t: 50.3, se: 2.2 },
  95: { t: 51.5, se: 2.5 }, 96: { t: 53.0, se: 2.8 }, 97: { t: 54.9, se: 3.3 },
  98: { t: 57.0, se: 3.6 }, 99: { t: 62.7, se: 5.7 },
}

// PROMIS Adult v2.1 Upper Extremity 7a Short Form Conversion Table.
// Source: PROMIS Physical Function User Manual & Scoring Instructions
// (24 Nov 2025), Appendix 1, p. 28. Raw 7–35, higher raw = better function.
const PROMIS_UE_SF7A: PromisLookupTable = {
   7: { t: 16.3, se: 3.0 },  8: { t: 19.3, se: 2.7 },  9: { t: 21.1, se: 2.5 },
  10: { t: 22.6, se: 2.4 }, 11: { t: 23.9, se: 2.4 }, 12: { t: 25.0, se: 2.3 },
  13: { t: 26.1, se: 2.3 }, 14: { t: 27.0, se: 2.3 }, 15: { t: 27.9, se: 2.3 },
  16: { t: 28.8, se: 2.3 }, 17: { t: 29.7, se: 2.3 }, 18: { t: 30.5, se: 2.3 },
  19: { t: 31.4, se: 2.3 }, 20: { t: 32.2, se: 2.3 }, 21: { t: 33.0, se: 2.3 },
  22: { t: 33.9, se: 2.3 }, 23: { t: 34.7, se: 2.4 }, 24: { t: 35.6, se: 2.4 },
  25: { t: 36.6, se: 2.5 }, 26: { t: 37.5, se: 2.6 }, 27: { t: 38.6, se: 2.6 },
  28: { t: 39.7, se: 2.8 }, 29: { t: 40.9, se: 2.9 }, 30: { t: 42.3, se: 3.1 },
  31: { t: 43.9, se: 3.4 }, 32: { t: 45.6, se: 3.6 }, 33: { t: 47.7, se: 3.9 },
  34: { t: 50.9, se: 4.5 }, 35: { t: 58.2, se: 6.7 },
}

// Neuro-QOL Adult Upper Extremity Function – Fine Motor, ADL 8-item Short Form.
// Source: Neuro-QoL User Manual v2 (24 Mar 2015), Appendix Table 7d.
// Items coded 5 = Without any difficulty .. 1 = Unable to do; raw 8–40,
// higher raw = better function.
const NEUROQOL_UE_SF: PromisLookupTable = {
   8: { t: 12.8, se: 2.0 },  9: { t: 13.7, se: 2.3 }, 10: { t: 14.7, se: 2.4 },
  11: { t: 15.8, se: 2.5 }, 12: { t: 16.9, se: 2.4 }, 13: { t: 18.0, se: 2.4 },
  14: { t: 19.0, se: 2.3 }, 15: { t: 19.9, se: 2.2 }, 16: { t: 20.8, se: 2.1 },
  17: { t: 21.6, se: 2.1 }, 18: { t: 22.4, se: 2.1 }, 19: { t: 23.1, se: 2.0 },
  20: { t: 23.9, se: 2.0 }, 21: { t: 24.6, se: 2.0 }, 22: { t: 25.3, se: 2.0 },
  23: { t: 26.0, se: 2.0 }, 24: { t: 26.7, se: 2.0 }, 25: { t: 27.3, se: 2.0 },
  26: { t: 28.0, se: 2.0 }, 27: { t: 28.7, se: 2.0 }, 28: { t: 29.5, se: 2.0 },
  29: { t: 30.2, se: 2.1 }, 30: { t: 30.9, se: 2.1 }, 31: { t: 31.7, se: 2.1 },
  32: { t: 32.6, se: 2.2 }, 33: { t: 33.5, se: 2.3 }, 34: { t: 34.5, se: 2.4 },
  35: { t: 35.6, se: 2.7 }, 36: { t: 37.1, se: 3.2 }, 37: { t: 39.3, se: 4.2 },
  38: { t: 41.2, se: 4.5 }, 39: { t: 43.7, se: 4.7 }, 40: { t: 53.8, se: 7.8 },
}

function scoreFixedForm(
  responses: Record<string, number>,
  keys: string[],
  table: PromisLookupTable,
  higherIsBetter: boolean,
): ScoreResult {
  const vals = keys.map(k => responses[k]).filter(v => v !== null && v !== undefined)
  if (vals.length < keys.length) {
    throw new Error(`All ${keys.length} items are required to score (got ${vals.length})`)
  }
  const rawScore = vals.reduce((a, b) => a + b, 0)
  // Some published tables (e.g. PF 20a, which lists raw 20–99) omit the very
  // top raw value; a maximal responder is clamped to the ceiling entry.
  let entry = table[rawScore]
  let clamped = false
  if (!entry) {
    const keys = Object.keys(table).map(Number)
    const clampedRaw = Math.min(Math.max(rawScore, Math.min(...keys)), Math.max(...keys))
    entry = table[clampedRaw]
    clamped = clampedRaw !== rawScore
    if (!entry) throw new Error(`No lookup entry for raw score ${rawScore}`)
  }
  const bands = higherIsBetter ? PROMIS_FUNCTION_BANDS : PROMIS_SYMPTOM_BANDS
  const band = bands.find(b => entry!.t >= b.min && entry!.t <= b.max) ?? bands[bands.length - 1]
  return {
    rawScore,
    tScore:         entry.t,
    standardError:  entry.se,
    severityLabel:  band.label,
    interpretation: clamped
      ? `${band.interpretation} (raw ${rawScore} exceeds the published table; scored at the maximum measurable value)`
      : band.interpretation,
  }
}

export const scorePromisPFSF20a = (r: Record<string, number>) => scoreFixedForm(r, PF_SF20A_ITEMS, PROMIS_PF_SF20A, true)
export const scorePromisUESF7a  = (r: Record<string, number>) => scoreFixedForm(r, UE_SF7A_ITEMS,  PROMIS_UE_SF7A,  true)
export const scoreNeuroQOLUE    = (r: Record<string, number>) => scoreFixedForm(r, NEUROQOL_UE_ITEMS, NEUROQOL_UE_SF, true)

// ── Main scoring dispatcher ───────────────────────────────────────────────────

export const SCORING_FUNCTIONS: Record<string, (r: Record<string, number>) => ScoreResult> = {
  promis_pf_sf20a: scorePromisPFSF20a,
  promis_ue_sf7a:  scorePromisUESF7a,
  neuroqol_ue_sf:  scoreNeuroQOLUE,
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
  odi:                            scoreODI,
  ndi:                            scoreNDI,
  dash:                           scoreDASH,
  quickdash:                      scoreQuickDASH,
  koos:                           scoreKOOS,
  hoos:                           scoreHOOS,
  womac:                          scoreWOMAC,
  lefs:                           scoreLEFS,
  faam:                           scoreFAAM,
  haq_di:                         scoreHAQDI,
  uw_pain:                        scoreUWPain,
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
  // Custom surveys mix items from differently-scored instruments, so no
  // composite score exists — only the item-level responses are stored.
  if (instrument?.scoring_config?.type === 'none') {
    return {
      rawScore:       Object.keys(responses).length,
      severityLabel:  '',
      interpretation: 'Item-level responses only; this survey has no composite score',
    }
  }
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
  odi: {
    displayName:    'Oswestry Disability Index (ODI)',
    shortName:      'ODI',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       100,
    citation:       'Fairbank JCT, Pynsent PB. The Oswestry Disability Index. Spine. 2000;25(22):2940-2952.',
  },
  ndi: {
    displayName:    'Neck Disability Index (NDI)',
    shortName:      'NDI',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       50,
    citation:       'Vernon H, Mior S. The Neck Disability Index. J Manipulative Physiol Ther. 1991;14(7):409-415.',
  },
  dash: {
    displayName:    'Disabilities of the Arm, Shoulder and Hand (DASH)',
    shortName:      'DASH',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       100,
    citation:       'Hudak PL, Amadio PC, Bombardier C. Development of an upper extremity outcome measure: the DASH. Am J Ind Med. 1996;29(6):602-608.',
  },
  quickdash: {
    displayName:    'QuickDASH',
    shortName:      'QuickDASH',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       100,
    citation:       'Beaton DE, Wright JG, Katz JN. Development of the QuickDASH. J Bone Joint Surg Am. 2005;87(5):1038-1046.',
  },
  koos: {
    displayName:    'Knee Injury and Osteoarthritis Outcome Score (KOOS)',
    shortName:      'KOOS',
    higherIsBetter: true,
    isPromis:       false,
    maxScore:       100,
    citation:       'Roos EM, Roos HP, Lohmander LS, Ekdahl C, Beynnon BD. KOOS: development of a self-administered outcome measure. J Orthop Sports Phys Ther. 1998;28(2):88-96.',
  },
  hoos: {
    displayName:    'Hip Disability and Osteoarthritis Outcome Score (HOOS)',
    shortName:      'HOOS',
    higherIsBetter: true,
    isPromis:       false,
    maxScore:       100,
    citation:       'Nilsdotter AK, Lohmander LS, Klässbo M, Roos EM. Hip disability and osteoarthritis outcome score (HOOS). BMC Musculoskelet Disord. 2003;4:10.',
  },
  womac: {
    displayName:    'WOMAC Osteoarthritis Index',
    shortName:      'WOMAC',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       96,
    citation:       'Bellamy N, Buchanan WW, Goldsmith CH, Campbell J, Stitt LW. Validation study of WOMAC. J Rheumatol. 1988;15(12):1833-1840.',
  },
  lefs: {
    displayName:    'Lower Extremity Functional Scale (LEFS)',
    shortName:      'LEFS',
    higherIsBetter: true,
    isPromis:       false,
    maxScore:       80,
    citation:       'Binkley JM, Stratford PW, Lott SA, Riddle DL. The Lower Extremity Functional Scale. Phys Ther. 1999;79(4):371-383.',
  },
  faam: {
    displayName:    'Foot and Ankle Ability Measure (FAAM)',
    shortName:      'FAAM',
    higherIsBetter: true,
    isPromis:       false,
    maxScore:       100,
    citation:       'Martin RL, Irrgang JJ, Burdett RG, Conti SF, Van Swearingen JM. Evidence of validity for the FAAM. Foot Ankle Int. 2005;26(11):968-983.',
  },
  haq_di: {
    displayName:    'Health Assessment Questionnaire (HAQ-DI)',
    shortName:      'HAQ-DI',
    higherIsBetter: false,
    isPromis:       false,
    maxScore:       3,
    citation:       'Fries JF, Spitz P, Kraines RG, Holman HR. Measurement of patient outcome in arthritis. Arthritis Rheum. 1980;23(2):137-145.',
  },
  uw_pain: {
    displayName:    'UW Concerns About Pain (UW-CAP)',
    shortName:      'UW-CAP',
    higherIsBetter: false,
    isPromis:       true,   // T-scored (mean 50, SD 10) — surfaced like PROMIS
    maxScore:       80,
    citation:       'Amtmann D, Jensen MP, Turk D, et al. University of Washington Concerns About Pain (UW-CAP) Scale v1.0. 6-item short form. IRT-based T-score.',
  },
  promis_pf_sf20a: {
    displayName:    'PROMIS Physical Function SF 20a',
    shortName:      'PF 20a',
    higherIsBetter: true,
    isPromis:       true,
    maxScore:       100,
    citation:       'PROMIS Adult v2.0 Physical Function Short Form 20a. HealthMeasures raw-score-to-T-score table.',
  },
  promis_ue_sf7a: {
    displayName:    'PROMIS Upper Extremity SF 7a',
    shortName:      'UE 7a',
    higherIsBetter: true,
    isPromis:       true,
    maxScore:       35,
    citation:       'PROMIS Adult v2.1 Upper Extremity Short Form 7a. HealthMeasures raw-score-to-T-score conversion table (24 Nov 2025 manual).',
  },
  neuroqol_ue_sf: {
    displayName:    'Neuro-QOL Upper Extremity (Fine Motor / ADL) SF',
    shortName:      'Neuro-QOL UE',
    higherIsBetter: true,
    isPromis:       true,
    maxScore:       40,
    citation:       'Neuro-QOL Adult Upper Extremity Function – Fine Motor, ADL Short Form. Neuro-QOL scoring manual, Table 7d.',
  },
}
