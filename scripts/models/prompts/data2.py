# Prompt set data, part 2: the people of the kingdom (occupations from config/kingdom/characters.json).
import json
C = json.load(open('config/kingdom/characters.json'))['occupations']
SKIP = {'soldier', 'elite-guard', 'archer', 'commander', 'scout', 'ruler'}  # covered by units / kings

# Who (age, sex, build, face) and the extra, era-true details for each job.
EXTRA = {
 'farmer': ('a Khmer rice farmer, man about 40, strong legs, mud on the calves', 'a wide conical palm-leaf hat hanging on his back by a cord'),
 'rice-worker': ('a Khmer woman rice transplanter, about 25, strong forearms, wet mud to the knees', 'her sampot hitched high and tucked, a cloth wrapped over the chest (game modesty choice), a palm-leaf hat'),
 'fisher': ('a Khmer fisherman of the Tonle Sap, about 30, wiry, very dark sun-tanned skin', 'a wet sampot drawn up between the legs, a small woven fish creel tied at the hip'),
 'hunter': ('a Khmer hunter, about 35, sinewy, scarred forearms', 'a boar-tusk necklace on a cord, a rattan belt with a gourd'),
 'forest-worker': ('a Khmer forest forager, about 45, wiry', 'a large conical woven back-basket carried by a tump strap across the forehead (basket empty and close to the back)'),
 'builder': ('a Khmer temple builder, about 30, very muscular shoulders and back, dust on the skin', 'a coil of palm-fibre rope over one shoulder, a cloth pad rolled on top of the head for carrying'),
 'stone-quarry-worker': ('a Khmer quarryman of Phnom Kulen, about 35, massive arms, grey sandstone dust on the skin', 'a leather pad strapped to the left palm'),
 'stone-carver': ('a Khmer master stone carver, about 50, focused face, fine stone dust on the forearms', 'a cloth tied over the hair against dust, a small pouch of chisels at the belt'),
 'woodworker': ('a Khmer woodcutter, about 30, broad back, wood chips on the skin', 'a cloth band round the forehead'),
 'carpenter': ('a Khmer carpenter, about 45, precise hands', 'a measuring cord coiled at the belt, a small charcoal marker behind the ear'),
 'boat-builder': ('a Khmer boat builder, about 40, tar-stained hands', 'a short apron-like cloth over the sampot'),
 'porter': ('a Khmer porter, about 25, thick shoulders with a callus on the right shoulder', 'a folded cloth pad on the shoulder for the carrying pole'),
 'oxcart-driver': ('a Khmer ox-cart driver, about 55, grey top-knot', 'a checked krama over one shoulder, a betel pouch at the belt'),
 'elephant-handler': ('a Khmer mahout, about 30, agile', 'an amulet cord across the chest, a white head cloth'),
 'water-worker': ('a Khmer canal digger, about 25, mud-covered legs and arms', 'a loose head cloth'),
 'merchant': ('a Khmer woman market trader, about 40, confident friendly face, plump', 'a better-quality patterned sampot with a woven belt, gold earrings, a small purse at the waist, a cloth over the chest (game modesty choice)'),
 'fish-seller': ('a Khmer woman fish seller, about 35, sturdy', 'a sampot tucked up at the knee, a cloth over the chest (game modesty choice), a cloth pad on the head'),
 'cook': ('a Khmer woman cook, about 45, round face, smoke-darkened arms', 'hair tied tightly in a bun, a cloth over the chest (game modesty choice), a cloth tied at the waist'),
 'potter': ('a Khmer potter, man about 40, clay-smeared hands and forearms', 'a short sampot, clay stains on the knees'),
 'weaver': ('a young Khmer woman weaver, about 20, graceful', 'hair in a neat bun, a fine striped silk sampot she wove herself, a cloth over the chest (game modesty choice)'),
 'basket-maker': ('a Khmer basket maker, man about 60, thin, skilled fingers', 'a few bamboo strips tucked behind one ear'),
 'metalworker': ('a Khmer blacksmith, about 40, huge forearms, small burn scars, soot on the skin', 'a leather apron over the sampot'),
 'goldworker': ('a Khmer goldsmith, about 50, careful eyes', 'a fine sampot, a small gold earring, a magnifying squint'),
 'jewelry-artisan': ('a Khmer jeweller, about 35, slender hands', 'a fine sampot, gold earrings and a thin gold armlet'),
 'temple-attendant': ('a Khmer temple servant, about 25, gentle face', 'a clean white sampot, a garland of jasmine round the neck'),
 'religious-specialist': ('a Khmer Brahmin priest (purohita), about 60, thin, long grey beard, dignified', 'a white cloth wrapped as a long sampot to the ankle, a white sacred thread (upavita) over the left shoulder, hair in a tall chignon, sandalwood marks on the forehead and arms'),
 'monk': ('a Khmer Buddhist monk of Jayavarman VII\'s time, about 35, calm face', 'a saffron-yellow robe leaving the right shoulder bare, shaved head, bare feet'),
 'scholar': ('a Khmer teacher (acharya), about 55, thoughtful face', 'a white sampot, hair in a chignon, a white cloth over one shoulder'),
 'scribe': ('a Khmer scribe, about 30, slim, precise', 'a plain sampot, hair in a chignon, a stylus tucked in the hair'),
 'royal-attendant': ('a Khmer palace attendant, young woman about 20, graceful', 'a fine silk sampot with gold borders, gold armlets and earrings, a jewelled chest band (game modesty choice), flowers in a high chignon'),
 'parasol-bearer': ('a Khmer parasol bearer of the royal procession, man about 25, upright posture', 'a red sampot drawn up between the legs, a cloth belt, a white head cloth'),
 'court-official': ('a Khmer court official (mratan), about 50, portly, dignified', 'a fine silk sampot with a long front panel, a jewelled belt, a gold collar and armlets, a small diadem round a chignon'),
 'royal-messenger': ('a Khmer royal messenger, about 22, lean runner\'s legs', 'a short sampot drawn up between the legs, a red cloth sash across the chest showing the king\'s service'),
 'naval-role': ('a Khmer naval soldier of the Bayon war canoes, about 25, powerful arms and shoulders', 'short cropped hair, a short sampot drawn up between the legs, a cloth belt in the team colour'),
 'musician': ('a Khmer temple musician, man about 35', 'a sampot with a patterned border, hair in a chignon with a flower'),
 'performer': ('a Khmer temple dancer (apsara), young woman about 20, graceful', 'a tall three-pointed gold crown, a jewelled collar and chest ornaments (game modesty choice), a long tight patterned sampot to the ankles with a flared front panel and a jewelled belt, armlets, bracelets and anklets'),
 'healer': ('a Khmer healer of Jayavarman VII\'s hospitals, about 50, kind face', 'a white sampot, a white cloth over one shoulder, hair in a chignon'),
 'child': ('a Khmer village child, about 8, cheerful', 'head shaved except for a small tuft of hair on top'),
 'elder': ('a Khmer village elder, grandmother about 70, thin, kind wrinkled face', 'white hair in a small bun, a long plain sampot, a cloth over the chest and shoulders'),
}

PEOPLE = []
for o in C:
    if o['id'] in SKIP: continue
    who, extra = EXTRA.get(o['id'], (f"a Khmer {o['en'].lower()}", ''))
    clothing = 'a small plain cotton sampot wrapped at the waist to the knee' if o['id'] == 'child' else o.get('clothing', 'sampot')
    p = (f"{who[0].upper()+who[1:]}, of the Angkor era (9th–13th century). Brown skin, black hair: {o.get('hair','top-knot')}. "
         f"Dress: {clothing}; {extra}. Jewellery: {o.get('jewelry','none')}. Barefoot. Realistic, dignified, everyday working person.")
    tools = ', '.join(o.get('tools', []))
    PEOPLE.append(dict(id='person-' + o['id'], en=o['en'], km=o['km'], size='1.45–1.65 m (child 1.25 m)', budget='6k',
        prompt=p,
        note=f"Tools (separate files, held in game): {tools or 'none'}. Workplace: {o.get('workstation','')}. {o.get('confidence','')}: {o.get('notes','')}"))
