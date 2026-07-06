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
UW_OPTS     = opts([(0, 'Not at all'), (1, 'Slightly'), (2, 'Moderately'), (3, 'Quite a bit'), (4, 'Extremely')])
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


def sql_str(s):
    if s is None or s == '':
        return 'null'
    return "'" + str(s).replace("'", "''") + "'"


def sql_jsonb(obj):
    return "'" + json.dumps(obj, ensure_ascii=False).replace("'", "''") + "'::jsonb"


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
            elif inst in ('KOOS', 'HOOS'):
                code = inst.lower()
                add(code, f'{code}_{i}', i, text, koos_like_options(i, n), row)
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
                add('uw_pain', f'uw_pain_{i}', i, text, UW_OPTS, row)
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
        ('dash', 'DASH — Disabilities of the Arm, Shoulder and Hand', 'DASH',
         'Please rate your ability to do the following activities in the last week.'),
        ('quickdash', 'QuickDASH', 'QuickDASH',
         'Please rate your ability to do the following activities in the last week.'),
        ('koos', 'KOOS — Knee injury and Osteoarthritis Outcome Score', 'KOOS',
         'Answer every question thinking of your knee and your symptoms during the last week.'),
        ('hoos', 'HOOS — Hip disability and Osteoarthritis Outcome Score', 'HOOS',
         'Answer every question thinking of your hip and your symptoms during the last week.'),
        ('womac', 'WOMAC Osteoarthritis Index', 'WOMAC',
         'Answer thinking of the affected joint over the last 48 hours.'),
        ('lefs', 'Lower Extremity Functional Scale (LEFS)', 'Lower Extremity Functional Scale',
         'Today, do you or would you have any difficulty at all with the following activities?'),
        ('faam', 'Foot and Ankle Ability Measure (FAAM)', 'Foot and Ankle Ability Measure',
         'Please answer every question with the one response that most closely describes your condition within the past week.'),
        ('haq_di', 'Health Assessment Questionnaire (HAQ-DI)', 'Health Assessment Questionnaire',
         'Please indicate the response which best describes your usual abilities OVER THE PAST WEEK.'),
        ('uw_pain', 'UW Pain-Related Concerns', 'Pain-Related Concerns',
         'Please indicate how much each statement applies to you.'),
    ]

    lines2 = [
        '-- Generated by scripts/generate_item_bank.py from data/PROM_Survey_Database.xlsx',
        '-- Registers the new instruments with question definitions built from the item bank.',
        '-- Scoring rules live in src/config/scoring.ts (see SCORING_FUNCTIONS).',
        '',
    ]
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
        lines2.append(f"""insert into public.instruments (code, name, version, scoring_config_key, languages, is_active, type, questions)
select {sql_str(code)}, {sql_str(name)}, null, {sql_str(code)}, '{{en}}', true, 'standard', {sql_jsonb(questions)}
where not exists (select 1 from public.instruments where scoring_config_key = {sql_str(code)});

update public.instruments set questions = {sql_jsonb(questions)}, name = {sql_str(name)}
where scoring_config_key = {sql_str(code)};
""")
    OUT_INSTRUMENTS.write_text('\n'.join(lines2))
    print(f'wrote {OUT_INSTRUMENTS.name}: {len(NEW_INSTRUMENTS)} instruments')


if __name__ == '__main__':
    main()
