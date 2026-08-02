#!/usr/bin/env python3
"""
Generates the item-bank seed migrations from data/PROM_Survey_Database.xlsx.

Outputs:
  supabase/migrations/20260706000003_item_bank_seed.sql        (321 items)
  supabase/migrations/20260706000004_new_instruments_seed.sql  (11 new instruments)

Run:  python3 scripts/generate_item_bank.py   (requires openpyxl)

Conventions:
  - items.instrument_code == instruments.scoring_config_key
  - items.item_key == the key stored in survey_responses.raw_responses,
    so item-level answers can be joined back to ICF/body-region metadata.
  - PROMIS-29 rows are mapped onto the app's existing per-domain 4a
    instruments (pf1..pf4, anx1..anx4, ...) by position.
"""
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / 'data' / 'PROM_Survey_Database.xlsx'
OUT_ITEMS = ROOT / 'supabase' / 'migrations' / '20260706000003_item_bank_seed.sql'
OUT_INSTRUMENTS = ROOT / 'supabase' / 'migrations' / '20260706000004_new_instruments_seed.sql'


def opts(pairs):
    return [{'value': v, 'label': l} for v, l in pairs]


LIKERT_NONE_EXTREME   = opts([(0, 'None'), (1, 'Mild'), (2, 'Moderate'), (3, 'Severe'), (4, 'Extreme')])
LIKERT_NEVER_ALWAYS_F = opts([(0, 'Never'), (1, 'Rarely'), (2, 'Sometimes'), (3, 'Often'), (4, 'Always')])
LIKERT_ALWAYS_NEVER   = opts([(0, 'Always'), (1, 'Often'), (2, 'Sometimes'), (3, 'Rarely'), (4, 'Never')])
LIKERT_PAIN_FREQ      = opts([(0, 'Never'), (1, 'Monthly'), (2, 'Weekly'), (3, 'Daily'), (4, 'Always')])
LIKERT_AWARE          = opts([(0, 'Never'), (1, 'Monthly'), (2, 'Weekly'), (3, 'Daily'), (4, 'Constantly')])
LIKERT_TOTALLY        = opts([(0, 'Not at all'), (1, 'Mildly'), (2, 'Moderately'), (3, 'Severely'), (4, 'Totally')])
LIKERT_EXTREMELY_04   = opts([(0, 'Not at all'), (1, 'Mildly'), (2, 'Moderately'), (3, 'Severely'), (4, 'Extremely')])

DASH_DIFFICULTY = opts([(1, 'No difficulty'), (2, 'Mild difficulty'), (3, 'Moderate difficulty'), (4, 'Severe difficulty'), (5, 'Unable')])
DASH_INTERFERE  = opts([(1, 'Not at all'), (2, 'Slightly'), (3, 'Moderately'), (4, 'Quite a bit'), (5, 'Extremely')])
DASH_LIMITED    = opts([(1, 'Not limited at all'), (2, 'Slightly limited'), (3, 'Moderately limited'), (4, 'Very limited'), (5, 'Unable')])
DASH_SEVERITY   = opts([(1, 'None'), (2, 'Mild'), (3, 'Moderate'), (4, 'Severe'), (5, 'Extreme')])
DASH_SLEEP      = opts([(1, 'No difficulty'), (2, 'Mild difficulty'), (3, 'Moderate difficulty'), (4, 'Severe difficulty'), (5, "So much difficulty that I can't sleep")])
DASH_AGREE      = opts([(1, 'Strongly disagree'), (2, 'Disagree'), (3, 'Neither agree nor disagree'), (4, 'Agree'), (5, 'Strongly agree')])

FAAM_OPTS   = opts([(4, 'No difficulty'), (3, 'Slight difficulty'), (2, 'Moderate difficulty'), (1, 'Extreme difficulty'), (0, 'Unable to do')])
LEFS_OPTS   = opts([(0, 'Extreme difficulty or unable to perform activity'), (1, 'Quite a bit of difficulty'), (2, 'Moderate difficulty'), (3, 'A little bit of difficulty'), (4, 'No difficulty')])
HAQ_OPTS    = opts([(0, 'Without any difficulty'), (1, 'With some difficulty'), (2, 'With much difficulty'), (3, 'Unable to do')])
PHQ_OPTS    = opts([(0, 'Not at all'), (1, 'Several days'), (2, 'More than half the days'), (3, 'Nearly every day')])
TSK_OPTS    = opts([(1, 'Strongly Disagree'), (2, 'Disagree'), (3, 'Agree'), (4, 'Strongly Agree')])
PCS_OPTS    = opts([(0, 'Not at all'), (1, 'To a slight degree'), (2, 'To a moderate degree'), (3, 'To a great degree'), (4, 'All the time')])
UW_OPTS     = opts([(1, 'Never'), (2, 'Rarely'), (3, 'Sometimes'), (4, 'Often'), (5, 'Always')])
PROMIS_PF   = opts([(5, 'Without any difficulty'), (4, 'With a little difficulty'), (3, 'With some difficulty'), (2, 'With much difficulty'), (1, 'Unable to do')])
PROMIS_FREQ = opts([(1, 'Never'), (2, 'Rarely'), (3, 'Sometimes'), (4, 'Often'), (5, 'Always')])
PROMIS_FREQ_REV = opts([(5, 'Never'), (4, 'Rarely'), (3, 'Sometimes'), (2, 'Usually'), (1, 'Always')])
PROMIS_AMT  = opts([(1, 'Not at all'), (2, 'A little bit'), (3, 'Somewhat'), (4, 'Quite a bit'), (5, 'Very much')])
NRS_OPTS    = opts([(i, str(i)) for i in range(11)])

# KOOS/HOOS option sets vary by position (official instrument wording)
def koos_like_options(pos, n_items):
    if pos <= 3:  return LIKERT_NEVER_ALWAYS_F     # symptoms frequency
    if pos <= 5:  return LIKERT_ALWAYS_NEVER       # straighten/bend fully
    if pos <= 7:  return LIKERT_NONE_EXTREME       # stiffness
    if pos == 8:  return LIKERT_PAIN_FREQ          # pain frequency
    if pos == n_items - 3: return LIKERT_AWARE     # QOL: awareness
    if pos == n_items - 2: return LIKERT_TOTALLY   # QOL: lifestyle modification
    if pos == n_items - 1: return LIKERT_EXTREMELY_04  # QOL: confidence
    return LIKERT_NONE_EXTREME                     # pain/ADL/sport + final QOL


# ── Official HOOS (Nilsdotter 2003) ──────────────────────────────────────────
# The PROM spreadsheet's "HOOS" mirrors the KOOS item structure (7 symptom / 8
# pain items) and is NOT the validated HOOS. These are the real 40 items:
# Symptoms 5, Pain 10, ADL 17, Sport/Rec 4, QOL 4. All scored 0 (none) to 4
# (extreme). ICF codes use top-level d-codes so they map to the ADL matrix.
# (text, options, icf_code, icf_label) — body region is Hip for every item.
HOOS_OFFICIAL = [
    # Symptoms (S1-S5)
    ('Do you feel grinding, hear clicking or any other type of noise from your hip?', LIKERT_NEVER_ALWAYS_F, None, None),
    ('Do you have difficulties spreading your legs wide apart?',                       LIKERT_NONE_EXTREME,   None, None),
    ('Do you have difficulties to stride out when walking?',                           LIKERT_NONE_EXTREME,   'd450', 'Walking'),
    ('How severe is your hip stiffness after first wakening in the morning?',          LIKERT_NONE_EXTREME,   None, None),
    ('How severe is your hip stiffness after sitting, lying or resting later in the day?', LIKERT_NONE_EXTREME, None, None),
    # Pain (P1-P10)
    ('How often do you have hip pain?',                                                LIKERT_PAIN_FREQ,      None, None),
    ('Pain when straightening your hip fully',                                         LIKERT_NONE_EXTREME,   None, None),
    ('Pain when bending your hip fully',                                               LIKERT_NONE_EXTREME,   None, None),
    ('Pain when walking on a flat surface',                                            LIKERT_NONE_EXTREME,   'd450', 'Walking'),
    ('Pain when going up or down stairs',                                              LIKERT_NONE_EXTREME,   'd455', 'Moving around'),
    ('Pain at night while in bed',                                                     LIKERT_NONE_EXTREME,   'd415', 'Maintaining a body position'),
    ('Pain when sitting or lying',                                                     LIKERT_NONE_EXTREME,   'd415', 'Maintaining a body position'),
    ('Pain when standing upright',                                                     LIKERT_NONE_EXTREME,   'd415', 'Maintaining a body position'),
    ('Pain when walking on a hard surface (asphalt, concrete, etc.)',                  LIKERT_NONE_EXTREME,   'd450', 'Walking'),
    ('Pain when walking on an uneven surface',                                         LIKERT_NONE_EXTREME,   'd450', 'Walking'),
    # Function, daily living (A1-A17)
    ('Descending stairs',                                                              LIKERT_NONE_EXTREME,   'd455', 'Moving around'),
    ('Ascending stairs',                                                               LIKERT_NONE_EXTREME,   'd455', 'Moving around'),
    ('Rising from sitting',                                                            LIKERT_NONE_EXTREME,   'd410', 'Changing basic body position'),
    ('Standing',                                                                       LIKERT_NONE_EXTREME,   'd415', 'Maintaining a body position'),
    ('Bending to the floor/picking up an object',                                      LIKERT_NONE_EXTREME,   'd410', 'Changing basic body position'),
    ('Walking on a flat surface',                                                      LIKERT_NONE_EXTREME,   'd450', 'Walking'),
    ('Getting in/out of a car',                                                        LIKERT_NONE_EXTREME,   'd470', 'Using transportation'),
    ('Going shopping',                                                                 LIKERT_NONE_EXTREME,   'd620', 'Acquisition of goods and services'),
    ('Putting on socks/stockings',                                                     LIKERT_NONE_EXTREME,   'd540', 'Dressing'),
    ('Rising from bed',                                                                LIKERT_NONE_EXTREME,   'd410', 'Changing basic body position'),
    ('Taking off socks/stockings',                                                     LIKERT_NONE_EXTREME,   'd540', 'Dressing'),
    ('Lying in bed (turning over, maintaining hip position)',                          LIKERT_NONE_EXTREME,   'd415', 'Maintaining a body position'),
    ('Getting in/out of bath',                                                         LIKERT_NONE_EXTREME,   'd510', 'Washing oneself'),
    ('Sitting',                                                                        LIKERT_NONE_EXTREME,   'd415', 'Maintaining a body position'),
    ('Getting on/off toilet',                                                          LIKERT_NONE_EXTREME,   'd530', 'Toileting'),
    ('Heavy domestic duties (moving heavy boxes, scrubbing floors, etc.)',            LIKERT_NONE_EXTREME,   'd640', 'Doing housework'),
    ('Light domestic duties (cooking, dusting, etc.)',                                 LIKERT_NONE_EXTREME,   'd640', 'Doing housework'),
    # Sport and recreation (SP1-SP4)
    ('Squatting',                                                                      LIKERT_NONE_EXTREME,   'd410', 'Changing basic body position'),
    ('Running',                                                                        LIKERT_NONE_EXTREME,   'd455', 'Moving around'),
    ('Twisting/pivoting on your loaded leg',                                           LIKERT_NONE_EXTREME,   'd455', 'Moving around'),
    ('Walking on an uneven surface',                                                   LIKERT_NONE_EXTREME,   'd450', 'Walking'),
    # Quality of life (Q1-Q4)
    ('How often are you aware of your hip problem?',                                   LIKERT_AWARE,          None, None),
    ('Have you modified your life style to avoid potentially damaging activities to your hip?', LIKERT_TOTALLY, None, None),
    ('How much are you troubled with lack of confidence in your hip?',                 LIKERT_EXTREMELY_04,   None, None),
    ('In general, how much difficulty do you have with your hip?',                     LIKERT_NONE_EXTREME,   None, None),
]

# ── Official UW-CAP 6-item short form (Amtmann/Jensen/Turk, UW, v1.0) ─────────
# The PROM spreadsheet's "UW Pain Concerns" is a different, non-validated item
# set on a 0-4 scale; it cannot use the official IRT T-score table. These are
# the real 6 items (1=Never ... 5=Always). Pain-catastrophizing cognitions →
# tagged to ICF b152 (emotional functions); no body region.
UW_CAP_OFFICIAL = [
    'My pain is more than I can manage.',
    'Because of my pain, I will never be happy again.',
    'Because of my pain, my life is terrible.',
    'My life will only get worse because of my pain.',
    'Did you keep thinking about how much it hurts?',
    'Did you have trouble thinking of anything other than your pain?',
]

# Official Spanish (informal register) translation, UW (Gonzalez & Obregon).
UW_CAP_ES = {
    'title':     'Preocupaciones sobre el dolor (UW-CAP)',
    'timeframe': 'En los últimos 7 días, ¿con qué frecuencia tuvo los siguientes pensamientos cuando sentía dolor?',
    'items': [
        'Mi dolor es más de lo que puedo manejar.',
        'A causa de mi dolor, nunca volveré a ser feliz.',
        'A causa de mi dolor, mi vida es terrible.',
        'Mi vida solo empeorará por mi dolor.',
        '¿Pensó constantemente en cuánto le dolía?',
        '¿Tuvo dificultad para pensar en algo que no fuera su dolor?',
    ],
    'options': opts([(1, 'Nunca'), (2, 'Raramente'), (3, 'A veces'), (4, 'Frecuentemente'), (5, 'Siempre')]),
}


def dash_options(fmt):
    f = fmt or ''
    if 'Strongly' in f:        return DASH_AGREE
    if 'Not limited' in f:     return DASH_LIMITED
    if 'Not at all' in f:      return DASH_INTERFERE
    if '1=None' in f:          return DASH_SEVERITY
    if 'So much difficulty' in f: return DASH_SLEEP
    return DASH_DIFFICULTY


# Excel position -> app item_key for instruments already administered by the app.
# TSK-11: the spreadsheet's item set differs from the app's Woby TSK-11 for
# 4 items; matched items map to app keys, unmatched keep bank-only keys.
TSK_KEYS = {1: 'tsk_1', 2: 'tsk_2', 3: 'tsk_3', 4: 'tsk_x1', 5: 'tsk_4', 6: 'tsk_5',
            7: 'tsk_6', 8: 'tsk_x2', 9: 'tsk_x3', 10: 'tsk_10', 11: 'tsk_11'}

# Option sets where a HIGHER value means BETTER function (all others: higher = worse)
HIGHER_IS_BETTER_SETS = (FAAM_OPTS, LEFS_OPTS, PROMIS_PF, PROMIS_FREQ_REV)

PROMIS29_DOMAINS = [
    # (start, end, instrument_code, key_prefix, options)
    (1,  4,  'promis_physical_function_4a_v2', 'pf',  PROMIS_PF),
    (5,  8,  'promis_anxiety_4a_v1',           'anx', PROMIS_FREQ),
    (9,  12, 'promis_depression_4a_v1',        'dep', PROMIS_FREQ),
    (13, 16, 'promis_fatigue_4a_v1',           'fat', PROMIS_AMT),
    (17, 20, 'promis_sleep_4a_v1',             'slp', PROMIS_AMT),
    (21, 24, 'promis_social_4a_v1',            'soc', PROMIS_FREQ_REV),
    (25, 28, 'promis_pain_interference_4a_v1', 'pi',  PROMIS_AMT),
]


def parse_icf(cell):
    """'d440 — Fine hand use' -> ('d440', 'Fine hand use')"""
    if not cell:
        return None, None
    s = str(cell).strip()
    m = re.match(r'^([bd]\d+)\s*[—–-]\s*(.+)$', s)
    if m:
        return m.group(1), m.group(2).strip()
    return None, s


def parse_odi_ndi(text):
    """'Pain intensity: stmt0 / stmt1 / ...' -> (section, [options 0..5])"""
    section, _, rest = text.partition(':')
    statements = [s.strip() for s in rest.split(' / ')]
    return section.strip(), opts(list(enumerate(statements)))


def ascii_safe(s):
    """Strip characters known to get mangled when this SQL is copy/pasted
    through a browser clipboard into the Supabase SQL editor (em/en dashes,
    curly quotes). Everything the app displays should round-trip as plain
    ASCII through that pipeline."""
    if not isinstance(s, str):
        return s
    return (s.replace('—', '-').replace('–', '-')
             .replace('‘', "'").replace('’', "'")
             .replace('“', '"').replace('”', '"'))


def clean(obj):
    """Recursively apply ascii_safe to every string in a JSON-able structure."""
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean(v) for v in obj]
    return ascii_safe(obj)


def sql_str(s):
    s = ascii_safe(s)
    if s is None or s == '':
        return 'null'
    return "'" + str(s).replace("'", "''") + "'"


def sql_jsonb(obj):
    # ensure_ascii=True escapes every non-ASCII char (e.g. Spanish é, ¿) as a
    # JSON \uXXXX sequence, so the emitted SQL is pure ASCII and survives being
    # pasted through the Supabase editor clipboard. Postgres' JSONB parser
    # decodes the escapes back into the correct Unicode characters on insert.
    return "'" + json.dumps(clean(obj), ensure_ascii=True).replace("'", "''") + "'::jsonb"


def main():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb['PROM Database']
    rows = [r for r in list(ws.iter_rows(values_only=True))[1:] if any(r)]

    by_inst = {}
    for r in rows:
        by_inst.setdefault(str(r[1]).strip(), []).append(r)

    items = []  # dicts matching the items table

    def add(inst_code, key, pos, text, options, row):
        icf1_c, icf1_l = parse_icf(row[2])
        icf2_c, icf2_l = parse_icf(row[3])
        mh_c, mh_l = parse_icf(row[4])
        items.append({
            'instrument_code': inst_code, 'item_key': key, 'position': pos,
            'text_en': text, 'options': options,
            'higher_is_worse': not any(options is s for s in HIGHER_IS_BETTER_SETS),
            'icf_primary_code': icf1_c, 'icf_primary_label': icf1_l,
            'icf_secondary_code': icf2_c, 'icf_secondary_label': icf2_l,
            'mh_code': mh_c, 'mh_label': mh_l,
            'body_region_primary': row[5] or None,
            'body_region_secondary': row[6] or None,
            'response_format': row[7] or None,
            'coding_notes': row[8] or None,
        })

    for inst, inst_rows in by_inst.items():
        n = len(inst_rows)
        for i, row in enumerate(inst_rows, start=1):
            text = str(row[0]).strip()

            if inst in ('ODI', 'NDI'):
                code = inst.lower()
                section, options = parse_odi_ndi(text)
                add(code, f'{code}_{i}', i, section, options, row)
            elif inst == 'DASH':
                add('dash', f'dash_{i}', i, text, dash_options(row[7]), row)
            elif inst == 'QuickDASH':
                add('quickdash', f'quickdash_{i}', i, text, dash_options(row[7]), row)
            elif inst == 'KOOS':
                add('koos', f'koos_{i}', i, text, koos_like_options(i, n), row)
            elif inst == 'HOOS':
                pass  # spreadsheet HOOS is KOOS-structured; official items emitted below
            elif inst == 'WOMAC':
                add('womac', f'womac_{i}', i, text, LIKERT_NONE_EXTREME, row)
            elif inst == 'FAAM':
                add('faam', f'faam_{i}', i, text, FAAM_OPTS, row)
            elif inst == 'LEFS':
                add('lefs', f'lefs_{i}', i, text, LEFS_OPTS, row)
            elif inst == 'HAQ-DI':
                add('haq_di', f'haq_di_{i}', i, text, HAQ_OPTS, row)
            elif inst == 'PROMIS-PF':
                add('promis_pf10', f'promis_pf_{i}', i, text, PROMIS_PF, row)
            elif inst == 'PHQ-9':
                add('phq9', f'phq_{i}', i, text, PHQ_OPTS, row)
            elif inst == 'GAD-7':
                add('gad7', f'gad_{i}', i, text, PHQ_OPTS, row)
            elif inst == 'TSK-11':
                add('tsk11', TSK_KEYS[i], i, text, TSK_OPTS, row)
            elif inst == 'PCS':
                add('pcs', f'pcs_{i}', i, text, PCS_OPTS, row)
            elif inst == 'UW Pain Concerns':
                pass  # spreadsheet items aren't the UW-CAP; official items emitted below
            elif inst == 'PROMIS-29':
                clean = re.sub(r'\s*\(PROMIS-29\)\s*$', '', text)
                if i == 29:
                    add('pain_nrs', 'nrs', 1, clean, NRS_OPTS, row)
                else:
                    for start, end, code, prefix, options in PROMIS29_DOMAINS:
                        if start <= i <= end:
                            add(code, f'{prefix}{i - start + 1}', i - start + 1, clean, options, row)
                            break
            else:
                raise SystemExit(f'Unmapped instrument: {inst}')

    # Emit the validated HOOS (the spreadsheet's HOOS was skipped above).
    for i, (text, options, icf_code, icf_label) in enumerate(HOOS_OFFICIAL, start=1):
        items.append({
            'instrument_code': 'hoos', 'item_key': f'hoos_{i}', 'position': i,
            'text_en': text, 'options': options,
            'higher_is_worse': True,
            'icf_primary_code': icf_code, 'icf_primary_label': icf_label,
            'icf_secondary_code': None, 'icf_secondary_label': None,
            'mh_code': None, 'mh_label': None,
            'body_region_primary': 'Hip', 'body_region_secondary': None,
            'response_format': '5-point Likert (None to Extreme)',
            'coding_notes': 'Official HOOS item (Nilsdotter 2003)',
        })

    # Emit the official UW-CAP 6-item short form (spreadsheet items skipped above).
    for i, text in enumerate(UW_CAP_OFFICIAL, start=1):
        items.append({
            'instrument_code': 'uw_pain', 'item_key': f'uw_pain_{i}', 'position': i,
            'text_en': text, 'options': UW_OPTS,
            'higher_is_worse': True,
            'icf_primary_code': None, 'icf_primary_label': None,
            'icf_secondary_code': None, 'icf_secondary_label': None,
            'mh_code': 'b152', 'mh_label': 'Emotional functions',
            'body_region_primary': None, 'body_region_secondary': None,
            'response_format': '5-point Likert (1=Never to 5=Always)',
            'coding_notes': 'Official UW-CAP 6-item short form (Amtmann et al., UW v1.0)',
        })

    # ── items seed SQL ────────────────────────────────────────────
    lines = [
        '-- Generated by scripts/generate_item_bank.py from data/PROM_Survey_Database.xlsx',
        '-- Do not hand-edit; re-run the script instead.',
        '',
    ]
    cols = ('instrument_code, item_key, position, text_en, options, higher_is_worse, '
            'icf_primary_code, icf_primary_label, icf_secondary_code, icf_secondary_label, '
            'mh_code, mh_label, body_region_primary, body_region_secondary, response_format, coding_notes')
    for it in items:
        vals = ', '.join([
            sql_str(it['instrument_code']), sql_str(it['item_key']), str(it['position']),
            sql_str(it['text_en']), sql_jsonb(it['options']),
            'true' if it['higher_is_worse'] else 'false',
            sql_str(it['icf_primary_code']), sql_str(it['icf_primary_label']),
            sql_str(it['icf_secondary_code']), sql_str(it['icf_secondary_label']),
            sql_str(it['mh_code']), sql_str(it['mh_label']),
            sql_str(it['body_region_primary']), sql_str(it['body_region_secondary']),
            sql_str(it['response_format']), sql_str(it['coding_notes']),
        ])
        lines.append(
            f'insert into public.items ({cols})\n  values ({vals})\n'
            '  on conflict (instrument_code, item_key) do update set\n'
            '    position = excluded.position, text_en = excluded.text_en, options = excluded.options,\n'
            '    higher_is_worse = excluded.higher_is_worse,\n'
            '    icf_primary_code = excluded.icf_primary_code, icf_primary_label = excluded.icf_primary_label,\n'
            '    icf_secondary_code = excluded.icf_secondary_code, icf_secondary_label = excluded.icf_secondary_label,\n'
            '    mh_code = excluded.mh_code, mh_label = excluded.mh_label,\n'
            '    body_region_primary = excluded.body_region_primary, body_region_secondary = excluded.body_region_secondary,\n'
            '    response_format = excluded.response_format, coding_notes = excluded.coding_notes;'
        )
    OUT_ITEMS.write_text('\n'.join(lines) + '\n')
    print(f'wrote {OUT_ITEMS.name}: {len(items)} items')

    # ── new instruments seed SQL ──────────────────────────────────
    NEW_INSTRUMENTS = [
        # code, name, title, timeframe
        ('odi', 'Oswestry Disability Index (ODI)', 'Oswestry Disability Index',
         'Please select the ONE statement in each section that best describes your condition today.'),
        ('ndi', 'Neck Disability Index (NDI)', 'Neck Disability Index',
         'Please select the ONE statement in each section that best describes your condition today.'),
        ('dash', 'Disabilities of the Arm, Shoulder and Hand (DASH)', 'DASH',
         'Please rate your ability to do the following activities in the last week.'),
        ('quickdash', 'QuickDASH', 'QuickDASH',
         'Please rate your ability to do the following activities in the last week.'),
        ('koos', 'Knee Injury and Osteoarthritis Outcome Score (KOOS)', 'KOOS',
         'Answer every question thinking of your knee and your symptoms during the last week.'),
        ('hoos', 'Hip Disability and Osteoarthritis Outcome Score (HOOS)', 'HOOS',
         'Answer every question thinking of your hip and your symptoms during the last week.'),
        ('womac', 'WOMAC Osteoarthritis Index', 'WOMAC',
         'Answer thinking of the affected joint over the last 48 hours.'),
        ('lefs', 'Lower Extremity Functional Scale (LEFS)', 'Lower Extremity Functional Scale',
         'Today, do you or would you have any difficulty at all with the following activities?'),
        ('faam', 'Foot and Ankle Ability Measure (FAAM)', 'Foot and Ankle Ability Measure',
         'Please answer every question with the one response that most closely describes your condition within the past week.'),
        ('haq_di', 'Health Assessment Questionnaire (HAQ-DI)', 'Health Assessment Questionnaire',
         'Please indicate the response which best describes your usual abilities OVER THE PAST WEEK.'),
        ('uw_pain', 'UW Concerns About Pain (UW-CAP)', 'UW Concerns About Pain',
         'In the past 7 days, how often did you have each of the following thoughts when you were in pain?'),
    ]

    lines2 = [
        '-- Generated by scripts/generate_item_bank.py from data/PROM_Survey_Database.xlsx',
        '-- Registers the new instruments with question definitions built from the item bank.',
        '-- Scoring rules live in src/config/scoring.ts (see SCORING_FUNCTIONS).',
        '',
    ]
    # Instruments with an official translation: code -> Spanish question data.
    SPANISH = {'uw_pain': UW_CAP_ES}

    for code, name, title, timeframe in NEW_INSTRUMENTS:
        inst_items = sorted([it for it in items if it['instrument_code'] == code], key=lambda x: x['position'])
        uniform = all(it['options'] == inst_items[0]['options'] for it in inst_items)
        qdef = {
            'title': title,
            'timeframe': timeframe,
            'items': [
                {'id': it['item_key'], 'text': it['text_en'],
                 **({} if uniform else {'options': it['options']})}
                for it in inst_items
            ],
            'options': inst_items[0]['options'] if uniform else [],
        }
        questions = {'en': qdef}
        langs = 'en'
        es = SPANISH.get(code)
        if es:
            questions['es'] = {
                'title': es['title'],
                'timeframe': es['timeframe'],
                'items': [{'id': it['item_key'], 'text': es['items'][i]}
                          for i, it in enumerate(inst_items)],
                'options': es['options'],
            }
            langs = 'en,es'
        lines2.append(f"""insert into public.instruments (code, name, version, scoring_config_key, languages, is_active, type, questions)
select {sql_str(code)}, {sql_str(name)}, null, {sql_str(code)}, '{{{langs}}}', true, 'standard', {sql_jsonb(questions)}
where not exists (select 1 from public.instruments where scoring_config_key = {sql_str(code)});

update public.instruments set questions = {sql_jsonb(questions)}, name = {sql_str(name)}, languages = '{{{langs}}}'
where scoring_config_key = {sql_str(code)};
""")
    OUT_INSTRUMENTS.write_text('\n'.join(lines2))
    print(f'wrote {OUT_INSTRUMENTS.name}: {len(NEW_INSTRUMENTS)} instruments')


if __name__ == '__main__':
    main()
