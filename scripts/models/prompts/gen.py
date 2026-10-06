import json, sys, html, re
sys.path.insert(0, 'scripts/models/prompts')
from data1 import HEROES, KINGS, UNITS, ENEMIES
from data2 import PEOPLE
from data3 import MOUNTS, LIVESTOCK, FISH, WILD
from data4 import BUILDINGS, FIELD, ROADS, VEHICLES
from data5 import TEMPLES, PARTS
from data6 import WEAPONS, TOOLS, LOADS, NATURE

FRAME = {
 'character': 'Full-body game character reference image: one person only, front view, standing in a relaxed A-pose with the arms held about 30 degrees out from the body, hands open with the fingers apart and clearly separated from the hips and the clothing, feet shoulder-width apart, both legs and ankles visible below the cloth. Empty hands: no weapon, tool or object. Calm face looking at the camera. Plain pure-white background, soft even light, no cast shadow, no floor, no text, no watermark. STYLE: correct realistic human anatomy and proportions, but stylised hand-painted surfaces — clean flat areas of colour with soft painted shading, crisp edges between skin, cloth and metal, rich saturated colour, no photographic grain, no skin pores, no fabric fuzz. The look of a 90s cel-animated film character sheet.',
 'animal': 'Game creature reference image: one animal only, three-quarter view from the front side, standing naturally with every leg separate and fully visible, the tail held away from the body, mouth closed, no rider, no people. Plain pure-white background, soft even light, no cast shadow, no ground, no text. STYLE: correct realistic animal anatomy and proportions, but stylised hand-painted surfaces — fur, hide and feathers as simplified painted masses and clean colour areas rather than individual hairs, soft painted shading, rich saturated colour, no photographic grain. The look of a 90s cel-animated film.',
 'building': 'Game building reference image: this one building on its own, three-quarter view from about 30 degrees above, the whole building in frame including its base and footings, no surrounding ground or landscape, no people, no animals, no trees. Plain pure-white background, soft even daylight, no cast shadow, no text. Newly built. STYLE: correct real proportions and construction, but stylised hand-painted surfaces — wood, thatch, clay tile, laterite and sandstone as clean painted colour areas with simplified grain and soft shading, no photographic grain, no dirt or weathering speckle. The look of a 90s cel-animated film background.',
 'temple': 'Game architecture reference image: this one temple on its own, three-quarter view from about 35 degrees above showing two sides and the top, the whole monument in frame, no surrounding landscape, no people, no trees. Complete and new as on the day it was consecrated: fresh stone, every tower, roof and stair intact, no ruins, no moss, no vegetation. Plain pure-white background, soft even daylight, no cast shadow, no text. STYLE: correct real proportions and accurate architecture, but stylised hand-painted stone — clean warm sandstone and laterite colour areas with soft painted shading, the carving reading as clear bold shapes rather than photographic surface detail, no grain, no weathering. The look of a 90s cel-animated film background.',
 'part': 'Game architecture part reference image: this one carved element on its own, three-quarter view, the whole piece in frame, plain pure-white background, soft even light, no cast shadow, no text. STYLE: correct real proportions, but stylised hand-painted stone — clean colour areas with soft painted shading, the carving reading as clear bold shapes, no photographic grain or weathering.',
 'prop': 'Game prop reference image: this one object (or the listed set) on its own, three-quarter view from slightly above, the whole object in frame, no hands, no people. Plain pure-white background, soft even light, no cast shadow, no text. STYLE: correct real proportions and materials, but stylised hand-painted surfaces — clean colour areas with soft painted shading, crisp edges between wood, iron, bronze and cloth, no photographic grain.',
 'plant': 'Game nature reference image: this one plant or rock on its own, side view from slightly above, the whole thing in frame from its base to its top, no ground plane, no other plants. Plain pure-white background, soft even daylight, no cast shadow, no text. STYLE: correct real proportions, but stylised hand-painted foliage and rock — leaves grouped into simplified painted masses in two or three greens rather than individual leaves, soft painted shading, no photographic grain.',
}

GROUPS = [
 ('heroes', 'Heroes (3D hero mode)', 'character', 'models/heroes', HEROES, 'The ten heroes you play in 3D. Generate each WITHOUT weapon or tool in hand: the game attaches the weapons (section Weapons & gear). These replace the built-in figures first.'),
 ('kings', 'Kings by era', 'character', 'models/kings', KINGS, 'The king\'s look changes with the era of each chapter.'),
 ('units', 'Army and village units', 'character', 'models/units', UNITS, 'The strategy-map people. Riders are generated standing; the game seats them. Leave the belt or krama a plain colour: the game paints it in the team colour.'),
 ('enemies', 'Enemy peoples', 'character', 'models/enemies', ENEMIES, 'The four opponents of the campaign.'),
 ('people', 'People of the kingdom (occupations)', 'character', 'models/people', PEOPLE, 'From the game\'s occupation research (characters.json). Women wear a breast cloth as a game choice; the Angkor reliefs show women bare-chested.'),
 ('mounts', 'Mounts and draught animals', 'animal', 'models/animals', MOUNTS, 'Generate without riders; the game seats the riders.'),
 ('livestock', 'Village livestock', 'animal', 'models/animals', LIVESTOCK, ''),
 ('wild', 'Wild animals', 'animal', 'models/animals', WILD, 'The game\'s 26 wildlife kinds (world.json).'),
 ('fish', 'Fish', 'animal', 'models/animals', FISH, 'Side view is fine for fish.'),
 ('buildings', 'Buildings', 'building', 'models/buildings', BUILDINGS, 'Door side should face the camera (the game turns houses to face east).'),
 ('fields', 'Rice fields and crops', 'plant', 'models/fields', FIELD, 'The rice year: seedbed, transplanted, growing, ripe, stubble.'),
 ('roads', 'Royal roads and water works', 'building', 'models/roads', ROADS, ''),
 ('vehicles', 'Vehicles, ships and machines', 'prop', 'models/vehicles', VEHICLES, 'Generate empty, with no animals or crew.'),
 ('temples', 'The 13 campaign temples', 'temple', 'models/temples', TEMPLES, 'One per chapter. These are large: TRELLIS works best on one compact monument per image. For the biggest (Angkor Wat, Bayon, Preah Khan, Ta Prohm) you can also make the core only and build the rest from the parts kit.'),
 ('parts', 'Temple parts kit', 'part', 'models/parts', PARTS, 'Pieces the building site and the stone-by-stone temples are assembled from.'),
 ('weapons', 'Weapons and gear', 'prop', 'models/gear', WEAPONS, 'Generate each weapon lying flat, seen from the side, whole length in frame.'),
 ('tools', 'Working tools and household things', 'prop', 'models/tools', TOOLS, 'The tools the people hold and the things around houses, kitchens, workshops and temples.'),
 ('loads', 'Carried loads', 'prop', 'models/loads', LOADS, 'What a worker carries home.'),
 ('nature', 'Trees, plants and resources', 'plant', 'models/nature', NATURE, ''),
]

ids = set(); total = 0
out = []
for gid, title, kind, folder, items, note in GROUPS:
    rows = []
    for it in items:
        assert re.fullmatch(r'[a-z0-9-]+', it['id']), it['id']
        assert it['id'] not in ids, it['id']; ids.add(it['id'])
        rows.append(dict(it, file=f"{it['id']}.glb", folder=folder, kind=kind, full=it['prompt'].strip() + ' ' + FRAME[kind]))
    total += len(rows)
    out.append(dict(id=gid, title=title, kind=kind, folder=folder, note=note, items=rows))
print('assets', total, 'groups', len(out))
json.dump(out, open('scripts/models/prompts/assets.json', 'w'), ensure_ascii=False, indent=1)

# Markdown copy for the project (docs/MODEL_PROMPTS.md).
md = ['# 3D model prompt set — The Temples · សាងប្រាសាទ', '',
      f'{total} assets in {len(out)} groups. Each prompt is an image prompt for a clean reference picture; feed the picture to TRELLIS.2 (image to 3D), save the GLB under the file name given, and the game tools shrink and rig it (`scripts/models/`). See the page in Claude for copy buttons and a checklist.', '']
for g in out:
    md += [f"## {g['title']} — `{g['folder']}/`", '']
    if g['note']: md += [g['note'], '']
    for it in g['items']:
        md += [f"### {it['en']} · {it['km']}", '', f"- File: `{it['file']}`", f"- Real size: {it['size']} · triangles after shrink: {it['budget']}"]
        if it.get('note'): md += [f"- Evidence: {it['note']}"]
        md += ['', '```text', it['full'], '```', '']
open('docs/MODEL_PROMPTS.md', 'w').write('\n'.join(md))
