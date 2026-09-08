#!/usr/bin/env python3
"""
Generates the ADL Functional Assessment battery seed migration from the
curated blueprint in data/adl_battery_blueprint.csv.

The battery is administered form-by-form, ask-once:

  1. PROMIS Physical Function SF 20a   (20 items, scored -> T-score)
  2. PROMIS Upper Extremity SF 7a      (6 new items shown; scored on 7)
  3. Neuro-QOL Upper Extremity SF      (6 new items shown; scored on 8)
  4. Supplemental & Descriptive items  (composite, no composite score)

Three items are shared and asked only once (in PF 20a) but feed more than
one form's score:
  PFA55, PFB26  -> PF 20a + Neuro-QOL UE
  PFA34         -> PF 20a + UE 7a

So 32 administered scored items produce 35 scored responses across the three
published short forms. Bank add-ons and supplemental (SUP-) items are
descriptive only and never enter a T-score.

Every item is also written to the public.items bank tagged with its ADL
domain, body region(s), and Item ID (= item_key) so the evaluator can filter
responses.  The raw-score -> T-score lookup tables live in
src/config/scoring.ts (transcribed from the published manuals).

Run:  python3 scripts/generate_adl_battery.py

JSON is emitted with ensure_ascii=True so the SQL survives copy/paste into
the Supabase editor without mojibake.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'supabase' / 'migrations' / '20260907000008_adl_battery_seed.sql'

BATTERY_NAME = 'ADL Functional Assessment (PROMIS PF 20a · UE 7a · Neuro-QOL UE)'

# Instrument codes (also used as scoring_config_key)
PF20A = 'promis_pf_sf20a'
UE7A  = 'promis_ue_sf7a'
NEURO = 'neuroqol_ue_sf'
SUPP  = 'adl_supplemental'

# ── Response scales ───────────────────────────────────────────────────────────
# Every scale is coded 5 = best/most able .. 1 = worst, EXCEPT the pain NRS
# (0..10, higher = worse). Both PROMIS "difficulty" and "capability/limit"
# item stems are 5..1, so they sum on the same metric.

DIFF = [  # ability / difficulty
    (5, 'Without any difficulty'), (4, 'With a little difficulty'),
    (3, 'With some difficulty'), (2, 'With much difficulty'), (1, 'Unable to do'),
]
LIMIT = [  # "Does your health now limit you..."
    (5, 'Not at all'), (4, 'Very little'), (3, 'Somewhat'),
    (2, 'Quite a lot'), (1, 'Cannot do'),
]
FREQ = [  # continence / sleep disruption (higher = better = less often)
    (5, 'Never'), (4, 'Rarely'), (3, 'Sometimes'), (2, 'Often'), (1, 'Always'),
]
SENSORY = [
    (5, 'No difficulty'), (4, 'Mild difficulty'), (3, 'Moderate difficulty'),
    (2, 'Severe difficulty'), (1, 'Unable / profound difficulty'),
]
WEIGHT = [
    (5, 'A case of water bottles from Costco (44 lbs / 20 kg)'),
    (4, 'A small child (25 lbs / 12 kg)'),
    (3, 'A shopping bag (10 lbs / 5 kg)'),
    (2, 'A can of soup (1 lb / 0.5 kg)'),
    (1, 'Unable to lift from the floor'),
]
SLEEPQ = [
    (5, 'Very good'), (4, 'Good'), (3, 'Fair'), (2, 'Poor'), (1, 'Very poor'),
]
SEX = [
    (5, 'Not at all'), (4, 'A little bit'), (3, 'Somewhat'),
    (2, 'Quite a bit'), (1, 'Very much'), (0, 'Prefer not to answer'),
]

def opts(scale):
    return [{'value': v, 'label': l} for v, l in scale]

# ── The item table ────────────────────────────────────────────────────────────
# Each row:
#   id       Item ID (= item_key; what the evaluator filters on)
#   text     question stem
#   render   which instrument DISPLAYS the item (shared items render in PF 20a)
#   scores   which forms this response feeds (empty = descriptive only)
#   section  ADL section header (drives the supplemental composite grouping)
#   domain   ADL domain tag
#   body     body region(s) that can drive the limitation
#   scale    response scale
#   note     design note (stored as coding_notes)
GEN = 'General'
UE = 'Upper extremity'; LE = 'Lower extremity'
CS = 'Cervical spine'; TS = 'Thoracic spine'; LS = 'Lumbar spine'
SPINE_UE_LE = [UE, LE, CS, TS, LS]

ITEMS = [
    # ── SECTION 1 — SELF-CARE AND PERSONAL HYGIENE ───────────────────────────
    dict(id='PFA16r1', text='Are you able to dress yourself, including tying shoelaces and buttoning your clothes?',
         render=PF20A, scores=[PF20A], section='Self-Care and Personal Hygiene',
         domain='Dressing', body=SPINE_UE_LE, scale=DIFF, note='Scored on PF 20a.'),
    dict(id='PFB17', text='Are you able to put on and take off your shoes and socks?',
         render=SUPP, scores=[], section='Self-Care and Personal Hygiene',
         domain='Dressing (lower body)', body=SPINE_UE_LE, scale=DIFF,
         note='Bank add-on (unscored). Closes the reach-to-foot gap 20a leaves.'),
    dict(id='PFA36', text='Are you able to put on and take off a coat or jacket?',
         render=UE7A, scores=[UE7A], section='Self-Care and Personal Hygiene',
         domain='Dressing (upper body)', body=[UE, CS, TS], scale=DIFF, note='Scored on UE 7a.'),
    dict(id='PFA35', text='Are you able to open and close a zipper?',
         render=NEURO, scores=[NEURO], section='Self-Care and Personal Hygiene',
         domain='Dressing (fasteners)', body=[UE], scale=DIFF, note='Scored on Neuro-QOL UE.'),
    dict(id='PFA55', text='Are you able to wash and dry your body?',
         render=PF20A, scores=[PF20A, NEURO], section='Self-Care and Personal Hygiene',
         domain='Bathing', body=SPINE_UE_LE, scale=DIFF,
         note='ASK ONCE - response feeds both the PF 20a and Neuro-QOL UE scores.'),
    dict(id='PFA34', text='Are you able to wash your back?',
         render=PF20A, scores=[PF20A, UE7A], section='Self-Care and Personal Hygiene',
         domain='Bathing (reach)', body=[UE, CS, TS], scale=DIFF,
         note='ASK ONCE - feeds both PF 20a and UE 7a scores.'),
    dict(id='PFA38', text='Are you able to dry your back with a towel?',
         render=PF20A, scores=[PF20A], section='Self-Care and Personal Hygiene',
         domain='Bathing (reach)', body=[UE, CS, TS], scale=DIFF, note='Scored on PF 20a.'),
    dict(id='PFB26', text='Are you able to shampoo your hair?',
         render=PF20A, scores=[PF20A, NEURO], section='Self-Care and Personal Hygiene',
         domain='Bathing / grooming', body=[UE, CS], scale=DIFF,
         note='ASK ONCE - feeds both PF 20a and Neuro-QOL UE scores.'),
    dict(id='PFB18', text='Are you able to shave your face or apply makeup?',
         render=SUPP, scores=[], section='Self-Care and Personal Hygiene',
         domain='Grooming', body=[UE], scale=DIFF,
         note='Bank add-on (unscored). Sustained arms-elevated grooming.'),
    dict(id='PFA50', text='Are you able to brush your teeth?',
         render=NEURO, scores=[NEURO], section='Self-Care and Personal Hygiene',
         domain='Dental care', body=[UE], scale=DIFF, note='Scored on Neuro-QOL UE.'),
    dict(id='PFC45r1', text='Are you able to sit on and get up from the toilet?',
         render=PF20A, scores=[PF20A], section='Self-Care and Personal Hygiene',
         domain='Toileting (transfer)', body=SPINE_UE_LE, scale=DIFF, note='Scored on PF 20a.'),
    dict(id='PFC51', text='Are you able to wipe yourself after using the toilet?',
         render=SUPP, scores=[], section='Self-Care and Personal Hygiene',
         domain='Toileting (hygiene)', body=SPINE_UE_LE, scale=DIFF,
         note='Bank add-on (unscored). Completes toileting per AMA Table 1-2.'),
    dict(id='PFC46', text='Are you able to transfer from a bed to a chair and back?',
         render=PF20A, scores=[PF20A], section='Self-Care and Personal Hygiene',
         domain='Transfer bed-chair', body=SPINE_UE_LE, scale=DIFF, note='Scored on PF 20a.'),
    dict(id='PFA51', text='Are you able to sit on the edge of a bed?',
         render=PF20A, scores=[PF20A], section='Self-Care and Personal Hygiene',
         domain='Transfer (bed)', body=SPINE_UE_LE, scale=DIFF, note='Scored on PF 20a.'),
    dict(id='PFA20', text='Are you able to cut your food using eating utensils?',
         render=SUPP, scores=[], section='Self-Care and Personal Hygiene',
         domain='Feeding', body=[UE, CS], scale=DIFF, note='Bank add-on (unscored).'),
    dict(id='PFB29r1', text='Are you able to lift a full cup or glass to your mouth?',
         render=SUPP, scores=[], section='Self-Care and Personal Hygiene',
         domain='Feeding', body=[UE, CS], scale=DIFF,
         note='Bank add-on (unscored). Descriptive use only.'),
    dict(id='SUP-C1', text='How often do you leak urine or have trouble controlling your bladder?',
         render=SUPP, scores=[], section='Self-Care and Personal Hygiene',
         domain='Continence (bladder)', body=[GEN], scale=FREQ,
         note='Supplemental screener; flags for history/exam follow-up.'),
    dict(id='SUP-C2', text='How often do you have trouble controlling your bowels?',
         render=SUPP, scores=[], section='Self-Care and Personal Hygiene',
         domain='Continence (bowel)', body=[GEN], scale=FREQ, note='Supplemental screener.'),
    dict(id='SUP-08', text='Which of the following do you currently use because of your condition?',
         render=SUPP, scores=[], section='Self-Care and Personal Hygiene',
         domain='Aids and devices', body=[GEN], scale='CHECKLIST',
         note='Supplemental. Restores the HAQ aids/devices modifier.'),

    # ── SECTION 2 — COMMUNICATION ────────────────────────────────────────────
    dict(id='PFA43', text='Are you able to write with a pen or pencil?',
         render=NEURO, scores=[NEURO], section='Communication',
         domain='Writing', body=[UE, CS], scale=DIFF, note='Scored on Neuro-QOL UE.'),
    dict(id='NQUEX44', text='Are you able to make a phone call using a touch tone key-pad?',
         render=NEURO, scores=[NEURO], section='Communication',
         domain='Phone (keypad)', body=[UE, CS], scale=DIFF, note='Scored on Neuro-QOL UE.'),
    dict(id='SUP-36', text='Are you able to type on a keyboard and use a mouse?',
         render=SUPP, scores=[], section='Communication',
         domain='Typing', body=[UE, CS], scale=DIFF, note='Supplemental; no bank item covers typing.'),
    dict(id='SUP-71', text='Are you able to use a cell phone, including tapping or swiping the screen and holding it to your ear?',
         render=SUPP, scores=[], section='Communication',
         domain='Cell phone', body=[UE, CS], scale=DIFF, note='Supplemental; modern complement to NQUEX44.'),

    # ── SECTION 3 — PHYSICAL ACTIVITY AND MOBILITY ───────────────────────────
    dict(id='SUP-11', text='Are you able to sit in an ordinary chair for about 30 minutes?',
         render=SUPP, scores=[], section='Physical Activity and Mobility',
         domain='Sitting', body=[CS, TS, LS, LE], scale=DIFF,
         note='Supplemental; no sitting item exists anywhere in PROMIS PF.'),
    dict(id='SUP-13', text='Are you able to stand in one place for about 30 minutes?',
         render=SUPP, scores=[], section='Physical Activity and Mobility',
         domain='Standing tolerance', body=[CS, TS, LS, LE], scale=DIFF, note='Supplemental.'),
    dict(id='PFC36r1', text='Does your health now limit you in walking more than a mile (1.6 km)?',
         render=PF20A, scores=[PF20A], section='Physical Activity and Mobility',
         domain='Walking', body=[LS, LE], scale=LIMIT, note='Scored on PF 20a.'),
    dict(id='PFB24', text='Are you able to run a short distance, such as to catch a bus?',
         render=PF20A, scores=[PF20A], section='Physical Activity and Mobility',
         domain='Walking (speed)', body=[LS, LE], scale=DIFF, note='Scored on PF 20a.'),
    dict(id='PFC37', text='Does your health now limit you in climbing one flight of stairs?',
         render=PF20A, scores=[PF20A], section='Physical Activity and Mobility',
         domain='Stairs', body=[LS, LE], scale=LIMIT, note='Scored on PF 20a.'),
    dict(id='PFA21', text='What best describes your ability to go up and down stairs?',
         render=SUPP, scores=[], section='Physical Activity and Mobility',
         domain='Stairs (descent)', body=[LS, LE], scale=DIFF,
         note='Bank add-on (unscored). Adds the descent direction the short forms omit.'),
    dict(id='PFA1', text='Does your health now limit you in doing vigorous activities, such as running, lifting heavy objects, participating in strenuous sports?',
         render=PF20A, scores=[PF20A], section='Physical Activity and Mobility',
         domain='Vigorous activity', body=[GEN], scale=LIMIT, note='Scored on PF 20a.'),
    dict(id='PFA3', text='Does your health now limit you in bending, kneeling, or stooping?',
         render=PF20A, scores=[PF20A], section='Physical Activity and Mobility',
         domain='Bend/kneel/stoop', body=[LS, LE], scale=LIMIT, note='Scored on PF 20a.'),
    dict(id='PFA41', text='Are you able to squat and get up?',
         render=SUPP, scores=[], section='Physical Activity and Mobility',
         domain='Squatting', body=[LS, LE, UE], scale=DIFF,
         note="Bank add-on (unscored). Decomposes PFA3's bundle."),
    dict(id='PFC40', text='Are you able to kneel on the floor?',
         render=SUPP, scores=[], section='Physical Activity and Mobility',
         domain='Kneeling', body=[LS, LE], scale=DIFF, note='Bank add-on (unscored).'),
    dict(id='PFC12', text='Does your health now limit you in doing two hours of physical labor?',
         render=PF20A, scores=[PF20A], section='Physical Activity and Mobility',
         domain='Workday (half)', body=[GEN], scale=LIMIT, note='Scored on PF 20a.'),
    dict(id='SUP-29', text='What is the heaviest weight you are able to lift from the floor to waist height?',
         render=SUPP, scores=[], section='Physical Activity and Mobility',
         domain='Floor-to-waist lift', body=SPINE_UE_LE, scale=WEIGHT,
         note='Supplemental graded scale (bank PFM38 floors out for impaired patients).'),
    dict(id='PFA11', text='Are you able to do chores such as vacuuming or yard work?',
         render=PF20A, scores=[PF20A], section='Physical Activity and Mobility',
         domain='Chores', body=SPINE_UE_LE, scale=DIFF, note='Scored on PF 20a.'),
    dict(id='PFA5', text='Does your health now limit you in lifting or carrying groceries?',
         render=PF20A, scores=[PF20A], section='Physical Activity and Mobility',
         domain='Chores', body=SPINE_UE_LE, scale=LIMIT, note='Scored on PF 20a.'),

    # ── SECTION 4 — SENSORY FUNCTION ─────────────────────────────────────────
    dict(id='SUP-74', text='How much difficulty do you have seeing (with glasses or contacts if you use them) - for example reading ordinary print or recognizing faces?',
         render=SUPP, scores=[], section='Sensory Function',
         domain='Seeing', body=[GEN], scale=SENSORY,
         note='Supplemental screener; PROMIS PF has no sensory items.'),
    dict(id='SUP-75', text='How much difficulty do you have hearing (with a hearing aid if you use one) - for example following a conversation?',
         render=SUPP, scores=[], section='Sensory Function',
         domain='Hearing', body=[GEN], scale=SENSORY, note='Supplemental screener.'),
    dict(id='SUP-76', text='How much difficulty do you have feeling things with your hands or feet - for example numbness, tingling, or trouble sensing hot and cold?',
         render=SUPP, scores=[], section='Sensory Function',
         domain='Tactile (touch)', body=[UE, LE, CS, LS], scale=SENSORY,
         note='Supplemental; also supports the tactile-discrimination side of hand function.'),
    dict(id='SUP-77', text='How much difficulty do you have tasting food and drink?',
         render=SUPP, scores=[], section='Sensory Function',
         domain='Taste', body=[GEN], scale=SENSORY, note='Supplemental screener.'),
    dict(id='SUP-78', text='How much difficulty do you have smelling things, such as food or smoke?',
         render=SUPP, scores=[], section='Sensory Function',
         domain='Smell', body=[GEN], scale=SENSORY,
         note='Supplemental; smoke detection is a safety-relevant anchor.'),

    # ── SECTION 5 — HAND AND ARM USE ─────────────────────────────────────────
    dict(id='PFA40', text='Are you able to turn a key in a lock?',
         render=NEURO, scores=[NEURO], section='Hand and Arm Use',
         domain='Grasping (key pinch)', body=[UE, CS], scale=DIFF, note='Scored on Neuro-QOL UE.'),
    dict(id='PFB21', text='Are you able to pick up coins from a table top?',
         render=NEURO, scores=[NEURO], section='Hand and Arm Use',
         domain='Tactile discrimination', body=[UE, CS], scale=DIFF, note='Scored on Neuro-QOL UE.'),
    dict(id='PFC42', text='Are you able to open a tight or new jar?',
         render=SUPP, scores=[], section='Hand and Arm Use',
         domain='Grasping (torque)', body=[UE, CS], scale=DIFF, note='Bank add-on (unscored).'),
    dict(id='PFA14r1', text='Are you able to carry a heavy object (over 10 pounds / 5 kg)?',
         render=UE7A, scores=[UE7A], section='Hand and Arm Use',
         domain='Lifting', body=[UE, CS, LS, TS, LE], scale=DIFF, note='Scored on UE 7a.'),
    dict(id='PFB13', text='Are you able to carry a shopping bag or briefcase?',
         render=UE7A, scores=[UE7A], section='Hand and Arm Use',
         domain='Carrying', body=[UE, CS, LS, TS, LE], scale=DIFF, note='Scored on UE 7a.'),
    dict(id='PFB28r1', text='Are you able to lift 10 pounds (5 kg) above your shoulder?',
         render=UE7A, scores=[UE7A], section='Hand and Arm Use',
         domain='Lifting (overhead)', body=[UE, CS, TS], scale=DIFF, note='Scored on UE 7a.'),
    dict(id='PFB34', text='Are you able to change a light bulb overhead?',
         render=UE7A, scores=[UE7A], section='Hand and Arm Use',
         domain='Reach (overhead)', body=[UE, CS, TS], scale=DIFF, note='Scored on UE 7a.'),
    dict(id='PFM16r', text='Are you able to pass a large and heavy platter of food to other people at the table?',
         render=UE7A, scores=[UE7A], section='Hand and Arm Use',
         domain='Lifting (bilateral)', body=[CS, UE], scale=DIFF, note='Scored on UE 7a.'),
    dict(id='PFA12', text='Are you able to push open a heavy door?',
         render=PF20A, scores=[PF20A], section='Hand and Arm Use',
         domain='Pushing', body=[CS, UE, TS], scale=DIFF, note='Scored on PF 20a.'),
    dict(id='PFB19r1', text='Are you able to squeeze a new tube of toothpaste?',
         render=PF20A, scores=[PF20A], section='Hand and Arm Use',
         domain='Grip (force)', body=[CS, UE], scale=DIFF,
         note='Scored on PF 20a (calibrated with collapsed codes).'),
    dict(id='PFB22', text='Are you able to hold a plate full of food?',
         render=PF20A, scores=[PF20A], section='Hand and Arm Use',
         domain='Static hold', body=[CS, UE, TS], scale=DIFF, note='Scored on PF 20a.'),

    # ── SECTION 7 — TRAVEL ───────────────────────────────────────────────────
    dict(id='PFA56', text='Are you able to get in and out of a car?',
         render=PF20A, scores=[PF20A], section='Travel',
         domain='Travel', body=SPINE_UE_LE, scale=DIFF, note='Scored on PF 20a. Anchors the Travel section.'),
    dict(id='SUP-79', text='Are you able to sit in a car for 1 hour without stopping?',
         render=SUPP, scores=[], section='Travel',
         domain='Riding in a car', body=[LE, CS, TS, LS], scale=DIFF, note='Supplemental.'),
    dict(id='SUP-59', text='Are you able to grip and turn the steering wheel, and reach the pedals comfortably?',
         render=SUPP, scores=[], section='Travel',
         domain='Driving (controls)', body=SPINE_UE_LE, scale=DIFF, note='Supplemental.'),
    dict(id='SUP-61', text='Are you able to take a bus or train?',
         render=SUPP, scores=[], section='Travel',
         domain='Public transit', body=[GEN], scale=DIFF, note='Supplemental.'),
    dict(id='SUP-80', text='Are you able to travel by plane, including walking through the airport and sitting through the flight?',
         render=SUPP, scores=[], section='Travel',
         domain='Air travel', body=SPINE_UE_LE, scale=DIFF,
         note='Supplemental composite of walking distance, sitting tolerance, and luggage handling.'),

    # ── SECTION 8 — SLEEP, SEXUAL FUNCTION, AND OVERALL ──────────────────────
    dict(id='SUP-81', text='In the past 7 days, how would you rate your sleep quality overall?',
         render=SUPP, scores=[], section='Sleep, Sexual Function, and Overall',
         domain='Sleep quality', body=[GEN], scale=SLEEPQ, note='Supplemental screener.'),
    dict(id='SUP-82', text='In the past 7 days, how often did pain or your condition wake you up or keep you from falling asleep?',
         render=SUPP, scores=[], section='Sleep, Sexual Function, and Overall',
         domain='Sleep disruption', body=[GEN], scale=FREQ, note='Supplemental screener.'),
    dict(id='SUP-83', text='In the past 30 days, how much has your condition interfered with your sexual activity?',
         render=SUPP, scores=[], section='Sleep, Sexual Function, and Overall',
         domain='Sexual function', body=[GEN], scale=SEX,
         note='Supplemental single screener with explicit Prefer-not-to-answer.'),
    dict(id='Global07', text='In the past 7 days, how would you rate your pain on average?',
         render=SUPP, scores=[], section='Sleep, Sexual Function, and Overall',
         domain='Pain intensity', body=[GEN], scale='NRS',
         note='PROMIS Global pain NRS (0 = no pain, 10 = worst imaginable).'),
]

# The check-all-that-apply device list for SUP-08.
DEVICE_OPTIONS = [
    'None', 'Wrist or thumb splint', 'Elbow or shoulder brace', 'Knee brace',
    'Ankle brace', 'Reacher or grabber', 'Sock aid or long-handled shoe horn',
    'Long-handled sponge', 'Button hook or zipper pull', 'Built-up utensils',
    'Jar opener', 'Grab bars', 'Raised toilet seat', 'Shower or tub bench',
    'Bed rail', 'Cane', 'Two canes', 'Crutch', 'Two crutches', 'Walker',
    'Wheelchair', 'Cervical collar', 'Lumbar support', 'Orthotic shoe insert',
]

# ── Derivations ───────────────────────────────────────────────────────────────

def by_id(item_id):
    return next(i for i in ITEMS if i['id'] == item_id)

def rendered(code):
    return [i for i in ITEMS if i['render'] == code]

def composition(code):
    """Ordered Item IDs whose response feeds this form's raw score."""
    return [i['id'] for i in ITEMS if code in i['scores']]

# ── Question JSON builders ────────────────────────────────────────────────────

def scored_form_questions(code, title):
    items = []
    for it in rendered(code):
        items.append({'id': it['id'], 'text': it['text'], 'options': opts(it['scale'])})
    return {'en': {'title': title, 'items': items, 'options': []}}

def supplemental_questions():
    """Composite: matrix blocks grouped by (section, scale), plus the SUP-08
    checklist and the Global07 pain NRS as their own blocks, in CSV order."""
    blocks = []
    cur = None  # active matrix block
    cur_key = None
    n = 0
    for it in rendered(SUPP):
        if it['scale'] == 'CHECKLIST':
            blocks.append({
                'kind': 'checklist', 'id': it['id'], 'title': it['text'],
                'instructions': 'Check all that currently apply.',
                'options': [{'value': i, 'label': l} for i, l in enumerate(DEVICE_OPTIONS)],
            })
            cur = cur_key = None
            continue
        if it['scale'] == 'NRS':
            blocks.append({
                'kind': 'nrs', 'id': it['id'], 'prompt': it['text'],
                'minLabel': 'No pain', 'maxLabel': 'Worst pain imaginable',
            })
            cur = cur_key = None
            continue
        # matrix item: start a new block when the section or scale changes
        key = (it['section'], id(it['scale']))
        if key != cur_key:
            n += 1
            cur = {
                'kind': 'matrix', 'id': f'supp_block_{n}', 'title': it['section'],
                'instructions': '', 'options': opts(it['scale']),
                'sections': [{'header': it['section'], 'items': []}],
            }
            blocks.append(cur)
            cur_key = key
        cur['sections'][0]['items'].append({'id': it['id'], 'text': it['text']})
    return {'en': {'title': 'Supplemental & Descriptive Items', 'blocks': blocks}}

# ── SQL emit ──────────────────────────────────────────────────────────────────

def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"

def sql_jsonb(obj):
    return "'" + json.dumps(obj, ensure_ascii=True).replace("'", "''") + "'::jsonb"

def emit_instrument(code, name, qtype, questions, scoring_config, version):
    sc = f"'{scoring_config}'::jsonb" if scoring_config else 'null'
    ver = sql_str(version) if version else 'null'
    return f"""insert into public.instruments (code, name, version, scoring_config_key, languages, is_active, type, questions, scoring_config)
select {sql_str(code)}, {sql_str(name)}, {ver}, {sql_str(code)}, '{{en}}', true, {sql_str(qtype)}, {sql_jsonb(questions)}, {sc}
where not exists (select 1 from public.instruments where scoring_config_key = {sql_str(code)});

update public.instruments
   set name = {sql_str(name)}, version = {ver}, type = {sql_str(qtype)}, languages = '{{en}}',
       questions = {sql_jsonb(questions)}, scoring_config = {sc}
 where scoring_config_key = {sql_str(code)};
"""

def emit_item(it, position):
    body = ', '.join(it['body'])
    scale_name = {id(DIFF): 'difficulty', id(LIMIT): 'capability/limit', id(FREQ): 'frequency',
                  id(SENSORY): 'sensory difficulty', id(WEIGHT): 'graded weight',
                  id(SLEEPQ): 'sleep quality', id(SEX): 'interference'}.get(id(it['scale']))
    if it['scale'] == 'CHECKLIST':
        options_json = json.dumps([{'value': i, 'label': l} for i, l in enumerate(DEVICE_OPTIONS)])
        higher_is_worse = 'false'
        resp_fmt = 'Check all that apply'
    elif it['scale'] == 'NRS':
        options_json = json.dumps([{'value': v, 'label': str(v)} for v in range(11)])
        higher_is_worse = 'true'
        resp_fmt = '0-10 numeric rating scale'
    else:
        options_json = json.dumps(opts(it['scale']))
        higher_is_worse = 'false'  # 5 = best/most able for every graded scale here
        resp_fmt = f'5-point Likert ({scale_name})'
    scored_on = ', '.join(it['scores']) if it['scores'] else 'descriptive only (unscored)'
    return (
        "insert into public.items (instrument_code, item_key, position, text_en, options, "
        "higher_is_worse, adl_domain, body_region_primary, response_format, coding_notes)\n"
        f"  values ({sql_str(it['render'])}, {sql_str(it['id'])}, {position}, {sql_str(it['text'])}, "
        f"{sql_str(options_json)}::jsonb, {higher_is_worse}, {sql_str(it['domain'])}, {sql_str(body)}, "
        f"{sql_str(resp_fmt)}, {sql_str(it['note'] + ' | Scores: ' + scored_on)})\n"
        "  on conflict (instrument_code, item_key) do update set\n"
        "    position = excluded.position, text_en = excluded.text_en, options = excluded.options,\n"
        "    higher_is_worse = excluded.higher_is_worse, adl_domain = excluded.adl_domain,\n"
        "    body_region_primary = excluded.body_region_primary,\n"
        "    response_format = excluded.response_format, coding_notes = excluded.coding_notes;"
    )

def main():
    lines = [
        '-- Generated by scripts/generate_adl_battery.py — do not hand-edit; re-run the script.',
        '-- ADL Functional Assessment battery: PROMIS PF SF 20a, UE SF 7a, Neuro-QOL UE SF,',
        '-- plus supplemental/descriptive items. Scoring lives in src/config/scoring.ts.',
        '',
        '-- 0. Tag column for the ADL domain (first-class, filterable).',
        'alter table public.items add column if not exists adl_domain text;',
        'create index if not exists items_adl_domain_idx on public.items (adl_domain);',
        '',
        '-- 1. Instruments -----------------------------------------------------------',
        emit_instrument(PF20A, 'PROMIS Physical Function SF 20a', 'standard',
                        scored_form_questions(PF20A, 'Physical Function'), None, 'v2.0'),
        emit_instrument(UE7A, 'PROMIS Upper Extremity SF 7a', 'standard',
                        scored_form_questions(UE7A, 'Upper Extremity Function'), None, 'v2.1'),
        emit_instrument(NEURO, 'Neuro-QOL Upper Extremity (Fine Motor / ADL) SF', 'standard',
                        scored_form_questions(NEURO, 'Upper Extremity Function (Fine Motor)'), None, 'v2.0'),
        emit_instrument(SUPP, 'ADL Supplemental & Descriptive Items', 'composite',
                        supplemental_questions(), '{"type": "none"}', None),
        '',
        '-- 2. Item bank (tagged with ADL domain, body region(s), Item ID) ----------',
    ]
    for pos, it in enumerate(ITEMS, start=1):
        lines.append(emit_item(it, pos))
    lines.append('')
    lines.append('-- 3. Battery (one per organization) ---------------------------------------')
    ids = f"""array[
      (select id from public.instruments where scoring_config_key = {sql_str(PF20A)}),
      (select id from public.instruments where scoring_config_key = {sql_str(UE7A)}),
      (select id from public.instruments where scoring_config_key = {sql_str(NEURO)}),
      (select id from public.instruments where scoring_config_key = {sql_str(SUPP)})
    ]::uuid[]"""
    lines.append(f"""insert into public.batteries (organization_id, name, instrument_ids, is_active)
select o.id, {sql_str(BATTERY_NAME)}, {ids}, true
  from public.organizations o
 where not exists (
   select 1 from public.batteries b
    where b.organization_id = o.id and b.name = {sql_str(BATTERY_NAME)}
 );""")
    lines.append('')

    OUT.write_text('\n'.join(lines))

    # Console summary / sanity checks
    print(f'wrote {OUT.name}')
    print(f'  items total: {len(ITEMS)}')
    for code, label, n_expected in [(PF20A, 'PF 20a', 20), (UE7A, 'UE 7a', 7), (NEURO, 'Neuro-QOL UE', 8)]:
        comp = composition(code)
        shown = len(rendered(code))
        flag = '' if len(comp) == n_expected else f'  !! expected {n_expected}'
        print(f'  {label}: shown {shown}, scored {len(comp)} {comp}{flag}')
    print(f'  supplemental shown: {len(rendered(SUPP))}')


if __name__ == '__main__':
    main()
