# Prompt set data, part 3: animals (mounts, livestock, wildlife, fish).
import json
W = {k['id']: k for k in json.load(open('config/kingdom/world.json'))['animals']['kinds']}

def A(id, en, km, size, budget, prompt, note=''):
    return dict(id=id, en=en, km=km, size=size, budget=budget, prompt=prompt, note=note)

MOUNTS = [
 A('animal-elephant-war', 'War elephant (Asian, bull)', 'ដំរីចម្បាំង', '2.8 m at the shoulder, 5.5 m long', '16k',
   'An adult Asian bull elephant of the Khmer royal army, 12th century: large but with the domed twin-lobed head and small ears of the Asian species, short tusks, grey wrinkled skin with pink mottling on the ears and trunk base. On its back a thick red woven saddle blanket with a gold-and-green border, held by a girth rope round the belly and a crupper rope under the tail; a bronze bell hanging on a rope under the neck; gold-capped tips on the tusks. Nothing on the blanket (the howdah is a separate file).',
   'Angkor Wat and Bayon reliefs show war elephants with saddle cloths, bells and a howdah or a bare platform.'),
 A('animal-elephant-work', 'Working elephant', 'ដំរីការងារ', '2.6 m at the shoulder', '12k',
   'An adult Asian elephant used for hauling timber and stone at Angkor: grey wrinkled skin with dusty patches, small ears, a short tail with a tuft, a thick rope harness round the chest and shoulders with a wooden pad, no decoration.',
   'Elephants hauled logs; whether they hauled temple stones is debated (HISTORICALLY_UNCERTAIN).'),
 A('animal-horse-war', 'War horse with saddle cloth', 'សេះចម្បាំង', '1.35 m at the withers', '10k',
   'A small, hardy Southeast Asian pony-sized horse of the 12th century, bay-brown with a black mane and tail, a short thick neck, alert ears. A rope bridle with a simple bit, a red saddle cloth with a gold fringe tied by a girth cord, a crupper strap, no stirrups, a small plume on the forehead.',
   'Horses ridden without stirrups on the Angkor Wat reliefs.'),
 A('animal-buffalo-mount', 'Water buffalo (riding)', 'ក្របីជិះ', '1.5 m at the shoulder', '10k',
   'A Cambodian swamp water buffalo: slate-grey almost hairless skin, wide sweeping crescent horns curving back, a heavy body, splayed hooves, a pale chevron on the throat, a nose rope tied through the nostrils, a folded cloth on the back for the rider.',
   'Water buffaloes appear on the Bayon reliefs.'),
 A('animal-ox-zebu', 'Ox (Khmer white zebu)', 'គោ', '1.3 m at the shoulder', '8k',
   'A Cambodian white zebu ox: creamy-white coat, a small hump over the shoulders, a loose dewlap, short horns, long drooping ears, a thin rope through the nose, a wooden neck yoke pad mark on the neck.',
   'Draught oxen pull the carts on the Bayon reliefs.'),
 A('animal-dog-village', 'Village / hunting dog', 'ឆ្កែ', '0.50 m at the shoulder', '5k',
   'A lean pariah-type Cambodian village dog: short tan-brown coat with a pale chest, a deep chest and tucked belly, pricked triangular ears, a pointed muzzle, a tail curled over the back, alert intelligent eyes.',
   'Dogs appear in Bayon daily-life scenes; the hunting dog is a game addition.'),
]

LIVESTOCK = [
 A('animal-pig-village', 'Village pig', 'ជ្រូកស្រុក', '0.9 m long, 0.5 m high', '4k',
   'A small black Khmer village pig: sway-backed with a pot belly that nearly touches the ground, short legs, a long snout with a pale pink disc, small pricked ears, sparse bristly black hair, a thin straight tail.'),
 A('animal-chicken-rooster', 'Rooster', 'មាន់ឈ្មោល', '0.45 m tall', '3k',
   'A Southeast Asian village rooster close to the wild red junglefowl: red comb and wattles, golden-orange hackle feathers, a glossy green-black arched tail, dark wings with a red-brown shoulder patch, yellow-grey legs.'),
 A('animal-chicken-hen', 'Hen', 'មាន់ញី', '0.35 m tall', '3k',
   'A Southeast Asian village hen: small, mottled brown and buff feathers, a tiny red comb, a short tail, grey legs.'),
 A('animal-buffalo-farm', 'Farm water buffalo', 'ក្របី', '1.45 m at the shoulder', '8k',
   'A working Cambodian swamp water buffalo with mud on the legs and belly: slate-grey skin, wide crescent horns, a nose rope, a wooden plough-yoke over the neck.'),
 A('animal-cow-zebu', 'Village cow (zebu)', 'គោញី', '1.2 m at the shoulder', '8k',
   'A Cambodian village zebu cow: light fawn to white coat, a small hump, a loose dewlap, short horns, long ears.'),
 A('animal-duck', 'Village duck', 'ទា', '0.4 m', '2k', 'A Southeast Asian village duck: brown speckled feathers, a dark bill, orange legs.'),
]

FISH = [
 A('fish-snakehead', 'Snakehead fish', 'ត្រីរ៉ស់', '0.5 m long', '2k', 'A striped snakehead (Channa striata): long cylindrical body, dark brown-olive with darker bands, a long dorsal fin, a flat head like a snake.'),
 A('fish-carp-riel', 'Small carp (trey riel)', 'ត្រីរៀល', '0.15 m long', '1k', 'A small silvery Mekong mud carp (Henicorhynchus), the trey riel of the Tonle Sap: slim silver body, forked tail, a small dark spot at the tail base.'),
 A('fish-giant-catfish', 'Mekong giant catfish', 'ត្រីរាជ', '2.5 m long', '4k', 'A Mekong giant catfish: huge grey-white body, a broad flat head with small eyes low on the head, no whiskers in adults, small fins.'),
]

# Wild animals: the game's 26 kinds, with what each looks like.
WILD_LOOK = {
 'deer': 'A sambar deer stag: dark brown shaggy coat, a thick mane, three-tined antlers, large rounded ears.',
 'boar': 'A wild boar of Southeast Asia: dark grey-black bristly coat, a crest of long bristles along the spine, a long snout, short sharp tusks, small eyes.',
 'banteng': 'A banteng bull: glossy chestnut-black coat, white stockings on all four legs, a white rump patch, curved upswept horns, a muscular shoulder.',
 'junglefowl': 'A wild red junglefowl rooster: red comb and wattles, golden hackles, a glossy dark green arched tail, slim legs.',
 'peafowl': 'A green peafowl cock: shimmering green-gold scaled body feathers, a tall upright crest, blue-and-yellow face skin, a long folded train of eye-spotted feathers held off the ground.',
 'tiger': 'An Indochinese tiger: orange coat with narrow black stripes, white belly and face markings, powerful shoulders, a long striped tail, yellow eyes.',
 'elephant': 'A wild Asian elephant cow in the forest: grey skin with dust, small ears, no tusks visible, a calm expression.',
 'gaur': 'A gaur bull: huge, glossy dark brown-black coat, white stockings, a high muscular ridge over the shoulders, thick upward-curving horns with pale bases.',
 'kouprey': 'A kouprey bull: grey-black coat, very long dewlap hanging from the neck, long lyre-shaped horns with frayed tips, white stockings.',
 'serow': 'A mainland serow: goat-like, shaggy black coat with a long grey-white mane, short backward-curving horns, large ears, sturdy legs.',
 'leopard': 'An Indochinese leopard: golden coat with black rosettes, white underside, a long tail, green-yellow eyes.',
 'cloudedLeopard': 'A clouded leopard: grey-tan coat with large dark cloud-shaped blotches edged in black, very long thick tail, short legs, long upper canines.',
 'sunBear': 'A sun bear: small, short sleek black fur, a pale orange crescent or U-shaped patch on the chest, a short pale muzzle, long curved claws.',
 'moonBear': 'An Asiatic black bear: shaggy black fur, a cream-white V-shaped crescent on the chest, large round ears, a brown muzzle.',
 'dhole': 'A dhole (Asian wild dog): rusty red coat, pale throat and belly, a black bushy tail, rounded ears.',
 'binturong': 'A binturong (bearcat): shaggy coarse black fur with grey tips, long white-tipped whiskers, tufted ears, a thick prehensile tail.',
 'gibbon': 'A pileated gibbon: very long arms, no tail, a male with black fur and a white ring round the face and white hands, standing upright.',
 'langur': 'A silvered langur: grey-black fur with silver tips, a pointed crest of hair on the head, a black face, a long tail.',
 'douc': 'A red-shanked douc langur: grey body, maroon-red lower legs, white forearms, black upper arms, a golden-yellow face, white whiskers, a long white tail.',
 'slowLoris': 'A pygmy slow loris: small, soft red-brown fur, huge round eyes ringed with dark fur, a dark stripe along the back, tiny ears.',
 'macaque': 'A long-tailed macaque: grey-brown fur, a pale face with whiskers, a long tail, an alert look.',
 'giantIbis': 'A giant ibis: tall dark grey-brown wading bird, a bare grey head and neck with dark bands on the back of the head, a long down-curved bill, red eyes.',
 'hornbill': 'A great hornbill: black and white plumage, a huge yellow bill with a large yellow casque on top, a white tail with a black band.',
 'crocodile': 'A Siamese crocodile: olive-green to dark grey scaly back, a broad smooth snout, a bony ridge behind the eyes, a long heavy tail, legs splayed.',
 'kingCobra': 'A king cobra: olive-brown with pale crossbands, a long body coiled on the ground with the front third raised and the narrow hood half open.',
 'python': 'A reticulated python: thick body with a complex net pattern of yellow, brown and black diamonds, coiled in loose loops, the head slightly raised.',
}
WILD_SIZE = {'deer':'1.3 m at the shoulder','boar':'0.9 m at the shoulder','banteng':'1.6 m at the shoulder','junglefowl':'0.45 m','peafowl':'1.0 m tall, train 1.5 m','tiger':'2.8 m long with tail','elephant':'2.5 m at the shoulder','gaur':'1.9 m at the shoulder','kouprey':'1.8 m at the shoulder','serow':'0.95 m at the shoulder','leopard':'2.1 m with tail','cloudedLeopard':'1.8 m with tail','sunBear':'1.3 m long','moonBear':'1.6 m long','dhole':'0.5 m at the shoulder','binturong':'1.4 m with tail','gibbon':'0.6 m sitting','langur':'1.2 m with tail','douc':'1.3 m with tail','slowLoris':'0.25 m','macaque':'1.0 m with tail','giantIbis':'1.05 m tall','hornbill':'1.2 m long','crocodile':'3.5 m long','kingCobra':'4 m long','python':'5 m long'}
WILD = [A('animal-' + k.replace('cloudedLeopard','clouded-leopard').replace('sunBear','sun-bear').replace('moonBear','moon-bear').replace('slowLoris','slow-loris').replace('giantIbis','giant-ibis').replace('kingCobra','king-cobra'),
          W[k]['en'], W[k]['km'], WILD_SIZE[k], '6k' if k in ('junglefowl','slowLoris','dhole') else '10k',
          WILD_LOOK[k], (W[k].get('notes') or '') + f" Habitat in game: {W[k].get('habitat')}.") for k in WILD_LOOK]
