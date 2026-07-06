/**
 * ADL impact computation for medical-legal evaluation.
 *
 * Maps item-level survey responses (via the item bank's ICF tagging) onto
 * activity-of-daily-living categories aligned with the AMA Guides (5th ed.
 * Table 1-2), broken out by body region. Each answered item contributes a
 * normalized impairment percentage (0 = no difficulty, 100 = maximal) to
 * every ADL category and body region it is tagged with.
 */
import type { Item } from '@/types/database'

export const ADL_CATEGORIES: { name: string; codes: string[] }[] = [
  { name: 'Self-Care & Personal Hygiene', codes: ['d510', 'd520', 'd530', 'd540', 'd550', 'd560'] },
  { name: 'Physical Activity & Mobility', codes: ['d410', 'd415', 'd420', 'd450', 'd455', 'd460', 'd465'] },
  { name: 'Hand & Arm Function',          codes: ['d430', 'd440', 'd445'] },
  { name: 'Travel',                       codes: ['d470', 'd475'] },
  { name: 'Household Activities',         codes: ['d620', 'd630', 'd640', 'd650', 'd660'] },
  { name: 'Work & Employment',            codes: ['d840', 'd845', 'd850', 'd855', 'd859'] },
  { name: 'Social Life & Recreation',     codes: ['d750', 'd760', 'd770', 'd910', 'd920', 'd930'] },
  { name: 'Cognition & Communication',    codes: ['d160', 'd166', 'd170', 'd175', 'd210', 'b140'] },
  { name: 'Sleep',                        codes: ['b134'] },
  { name: 'Mood & Energy',                codes: ['b130', 'b152'] },
]

const REGION_ORDER = [
  'Cervical', 'Lumbar', 'Shoulder', 'Elbow', 'Wrist', 'Hand/Fingers',
  'Upper Extremity (generalized)', 'Hip', 'Knee', 'Ankle', 'Foot',
  'Lower Extremity (generalized)', 'Generalized',
]

export interface AdlCell {
  impairmentPct: number
  nItems:        number
}

export interface AdlRow {
  category: string
  cells:    Record<string, AdlCell>
  overall:  AdlCell
}

export interface MultiRegionFinding {
  code:    string
  label:   string
  regions: { region: string; impairmentPct: number }[]
}

export interface AdlMatrixResult {
  regions:     string[]
  rows:        AdlRow[]
  multiRegion: MultiRegionFinding[]
  nAnswered:   number
}

/** Normalized impairment for one answered item: 0 (best) to 100 (worst). */
export function itemImpairment(item: Item, value: number): number | null {
  const vals = item.options.map(o => o.value)
  if (vals.length < 2) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (max === min) return null
  const frac = item.higher_is_worse ? (value - min) / (max - min) : (max - value) / (max - min)
  return Math.max(0, Math.min(1, frac)) * 100
}

function categoriesFor(item: Item): string[] {
  const codes = [item.icf_primary_code, item.icf_secondary_code, item.mh_code].filter(Boolean) as string[]
  const cats = new Set<string>()
  for (const code of codes) {
    for (const cat of ADL_CATEGORIES) {
      if (cat.codes.includes(code)) cats.add(cat.name)
    }
  }
  return Array.from(cats)
}

function regionsFor(item: Item): string[] {
  return [item.body_region_primary, item.body_region_secondary].filter(Boolean) as string[]
}

export function sortRegions(regions: string[]): string[] {
  return [...regions].sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a); const ib = REGION_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

/**
 * @param items    the item bank (or any subset covering the answered keys)
 * @param answers  merged raw_responses for a visit, keyed by item_key
 */
export function computeAdlMatrix(items: Item[], answers: Record<string, number>): AdlMatrixResult {
  const byKey = new Map(items.map(i => [i.item_key, i]))

  interface Acc { sum: number; n: number }
  const cellAcc   = new Map<string, Acc>()          // `${category}|${region}`
  const rowAcc    = new Map<string, Acc>()          // category
  const icfAcc    = new Map<string, Map<string, Acc>>()  // code -> region -> acc
  const icfLabels = new Map<string, string>()
  const regionSet = new Set<string>()
  let nAnswered = 0

  const bump = (m: Map<string, Acc>, key: string, v: number) => {
    const a = m.get(key) ?? { sum: 0, n: 0 }
    a.sum += v; a.n += 1
    m.set(key, a)
  }

  for (const [key, value] of Object.entries(answers)) {
    const item = byKey.get(key)
    if (!item) continue
    const imp = itemImpairment(item, value)
    if (imp === null) continue
    const cats = categoriesFor(item)
    const regions = regionsFor(item)
    if (cats.length === 0 || regions.length === 0) continue
    nAnswered += 1

    for (const cat of cats) {
      bump(rowAcc, cat, imp)
      for (const region of regions) {
        regionSet.add(region)
        bump(cellAcc, `${cat}|${region}`, imp)
      }
    }

    // Per-ICF-domain accumulation for the multi-region analysis (primary code only,
    // so a finding like "Dressing (d540)" reflects the item's main construct)
    if (item.icf_primary_code) {
      icfLabels.set(item.icf_primary_code, item.icf_primary_label ?? item.icf_primary_code)
      const regionMap = icfAcc.get(item.icf_primary_code) ?? new Map<string, Acc>()
      for (const region of regions) bump(regionMap, region, imp)
      icfAcc.set(item.icf_primary_code, regionMap)
    }
  }

  const regions = sortRegions(Array.from(regionSet))

  const rows: AdlRow[] = ADL_CATEGORIES
    .filter(c => rowAcc.has(c.name))
    .map(c => {
      const cells: Record<string, AdlCell> = {}
      for (const region of regions) {
        const a = cellAcc.get(`${c.name}|${region}`)
        if (a) cells[region] = { impairmentPct: Math.round(a.sum / a.n), nItems: a.n }
      }
      const overall = rowAcc.get(c.name)!
      return {
        category: c.name,
        cells,
        overall: { impairmentPct: Math.round(overall.sum / overall.n), nItems: overall.n },
      }
    })

  // ICF domains affected (>=25% mean impairment) in more than one body region —
  // the med-legal "is dressing affected by multiple body parts?" question.
  const multiRegion: MultiRegionFinding[] = []
  for (const [code, regionMap] of icfAcc) {
    const affected = Array.from(regionMap.entries())
      .map(([region, a]) => ({ region, impairmentPct: Math.round(a.sum / a.n) }))
      .filter(r => r.impairmentPct >= 25)
    if (affected.length >= 2 && !affected.every(r => r.region === 'Generalized')) {
      multiRegion.push({
        code,
        label: icfLabels.get(code) ?? code,
        regions: affected.sort((a, b) => b.impairmentPct - a.impairmentPct),
      })
    }
  }
  multiRegion.sort((a, b) => b.regions[0].impairmentPct - a.regions[0].impairmentPct)

  return { regions, rows, multiRegion, nAnswered }
}

/** Severity bucket used for consistent coloring in UI and PDF */
export function impairmentBucket(pct: number): 'none' | 'mild' | 'moderate' | 'severe' {
  if (pct < 25) return 'none'
  if (pct < 50) return 'mild'
  if (pct < 75) return 'moderate'
  return 'severe'
}
