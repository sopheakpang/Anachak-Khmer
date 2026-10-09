# Visual Bible — the Angkor Cel-Diorama look (1.7.0, 1.8.0)

The Kingdom and Anachak RTS views are a **living diorama of Angkor**. The world looks like a hand-painted model village with real weight and light. The people and animals look like illustrated characters placed into it. Two rules carry everything:

1. **The environment is stylised PBR.** The ground, buildings, trees, rocks and water are lit by a real sun and sky, cast real shadows, and keep their material weight (earth looks heavy, water looks wet, sandstone looks hard). Colours are clean and vivid but never neon.
2. **The characters are NPR.** People, animals and the royal court are flat and illustrative, like Genshin Impact's characters: the light falls into a few hard bands, an ink line runs round every figure, and a warm rim of light lifts its silhouette. They must read at a glance against any ground.

All the numbers live in `config/kingdom/diorama.json`, the game's equivalent of Godot's inspector. Graphics presets switch the look in `config/quality.json`: `kingdom.diorama` is on for low, high and ultra, and off for lite and the phone.

## The ground follows life

The land should look the way people have used it:

- **Meadow.** Untouched land is a fine natural lawn made from several greens, with broad meadow patches and the streak of grass blades. There are no scattered tufts on open ground.
- **Bare earth.** Earth shows wherever people live and work: a yard round every building, `ground.yardTiles` wide, with a ragged edge.
- **Paths.** Feet wear the grass away, so paths appear between the houses, the store, the quarry and the forest by themselves.
- **Regrowth.** Where nobody goes any more, the grass grows back.
- **Earth colours.** The earth is in three browns, with clods and a rim of yellowed grass round it.
- **Forest floor.** The forest floor is a darker moss green, with undergrowth under the trees.
- **Laterite.** Slopes, river banks and canal banks show warm laterite red.
- **Hollows.** Hollows and the foot of slopes darken in hard steps of painted shade. This is *block-shadow AO*, never noisy screen-space AO.

## Wild grass (1.8.0)

- **Height.** From the landscape view the grass stays under 1 m (PK): elephant grass 0.55–0.95 m, cogon grass (ស្បូវ) 0.3–0.7 m, taller in the middle of a stand and shorter at its edge, each tussock its own height.
- **Where.** Broad wild stands on open land and a fringe on the land along rivers and canals, never on the water. Never near buildings (3–5 tiles, with a ragged edge), on worn earth, roads, fields or unexplored land.
- **Look.** Dense tussocks, wider than tall. Elephant grass deep green, sunlit at the tips; cogon paler and yellower in its own patches; a few dry straw-coloured clumps; about a third flower in white plumes.
- **PK's models (1.8.0).** The tall stands are PK's Meshy grass "Resilient Oasis"; every open green meadow is covered by his "mix of cogon" as short grass 0.26–0.34 m high (above a person's foot, below the knee), tinted to the ground's green so the gaps read as more grass. Both are cards baked from the models (3 sides and from above). Worn paths, yards, fields, the water's edge and the forest floor stay without it.
- **Sun and seasons (1.8.0, Anachak Khmer).** A day lasts an hour, half light, half dark. The sun crosses from east to west over the south; at sunrise and sunset the sky and haze glow, the sun is a disc on the horizon and the water shows a path of its light. Dry season (November–April): gold and deep orange; wet season (May–October): rose and crimson, longer days. Rain and storms dull the glow.
- **Trees (1.8.0).** All trees are PK's own models: six kinds of broadleaf forest tree, the forest palm and the fan palm in the forests; a coconut palm and a banana plant by every house of a hamlet (three houses or more); now and then a palm or a coconut beside the worn paths to a storehouse. Close up the full model, further off a picture of it.
- **The royal hall (1.8.0).** PK's own model: a carved wooden hall on stilts, tiered dark roofs, a brick terrace with steps in front.
- **The lawn (1.8.0).** Under it all, the open green ground is a 10 cm lawn (PK's "make grass for floor"): it reaches above a person's foot, fills between the tussocks and thins only where paths wear the ground to earth. Here and there a cluster of stones sits in the grass (PK's "Grass and Stones").
- **Water (1.8.0).** Crystal-clear turquoise: the pale sand bed shows in the shallows with dancing light, deep teal in the middle (`diorama.json` water `clarity`, `caustics`).
- **Wind.** Gusts roll across the stands as visible waves: the leaves lean and turn pale as a gust passes. Windy weather and storms blow harder.
- **People.** A walker pushes the grass aside around him. In the 3D mode it grows round the hero, knee to hip high.

## The jungle ground (1.8.0)

- **Mud.** Paths and yards are red laterite clay, darker when wet. After rain, puddles stand in the hollows of the mud and mirror the sky (grey-blue by day, deep blue at night), with rings where drops fall.
- **Forest floor.** Drifts of dead leaves, mossy laterite rocks, fallen palm fronds and creeping roots; a few rocks out on open land and by the water.

## Humid air (1.8.0)

- **Mist.** Soft banks of ground mist drift low over the land: thick in mist and rain, at dawn and after rain, thin on a clear noon, blue at night.
- **Light shafts.** On cloudy days and after rain, beams of sunlight slant down from the sun through gaps in the clouds.

## See-through cover (1.8.0)

Zoomed in close, nothing hides the people at work: a building, a tree, a temple wall or a stand of grass in front of a person opens a soft window round him (a fine screen-door pattern, so the picture stays sharp). Zoomed out, everything is solid again.

## Night (1.8.0, Anachak Khmer)

- **Torches.** A torch by every house door; torches round the hall, storehouses, camps, the landing, the market, the barracks and the temple site; people out walking hold one up; a torch is planted by people still working in the open. Each throws a soft pool of warm light; the nearest light the walls and people around them.
- **Sky.** Hundreds of stars twinkle; the moon rises in the east and sets in the west, later each night, and waxes and wanes over 8 game days. Clouds go dark and moonlit blue.
- **Moonlight.** The night light comes from where the moon stands, cool blue, brighter at full moon.

## Water you cross (1.8.0)

Shallow water is waded, the water standing at its depth on the body. Deeper than the chest: a dugout boat paddled, or a bamboo raft poled with the load aboard (once there is a river landing); with no boat, people swim the front crawl, or tread water with only head and shoulders out when they stop.

## Light and shadow

- **Sun.** An afternoon sun at about 30° elevation (`light.elevation`) gives long, readable shadows. Every tree throws its shadow across the meadow.
- **Fill and contrast.** The sky's fill light is kept low (`light.fill`), so shadows stay deep and cool and the sun stays warm.
- **Foliage.** Trees take a deep natural green (`light.foliage`), each tree a slightly different shade.

## The camera: HD-2D diorama

- **Lens.** A long lens (`camera.fov` 18°) shoots from further back, so the view flattens like a model village. The framing matches the old 32° lens, so nothing in play moves.
- **Tilt-shift.** A band of sharp focus runs across the middle and the top and bottom blur, at every zoom and more when close (`post.focusBand`, `blur`, `blurClose`).
- **Grade.** Warm golden highlights sit against cool blue shadows, using hue only so brightness stays (`post.highlight`, `shadow`, `split`), with contrast, saturation and a soft vignette.

## Characters (NPR)

| Knob | What it does |
| --- | --- |
| `units.ramp` | The light steps: from 0 (unlit) to 1 (full sun), each band's brightness. Two to six bands; three by default. |
| `units.shadowTint` | The dark band's cool colour (the Genshin blue-violet shade). |
| `units.outlinePx` / `outline` | The ink line's width in screen pixels (constant at every zoom) and colour. |
| `units.rim` / `rimPower` | The warm edge light on the silhouette. |
| `units.saturation` | A little extra colour, so clothes and skin stay vivid. |

## Water: the Prek canals

The water uses no mirrors. Real reflections would smear at this camera angle, would draw the world twice, and would make shallow, silty Khmer canals look like alpine lakes. Instead:

- **Depth.** Depth fades from shallow jade over the silt bed to deep tropical teal.
- **Sky tint.** A Fresnel sky tint uses the time of day's colour in steps: noon cyan, amber at dawn, coral at dusk, indigo at night.
- **Sun glint.** The sun glints in a sharp two-step cel highlight.
- **Foam.** A crisp off-white foam line runs where water meets the bank.
- **Current.** Two slow ripple layers drift against each other, like a gentle canal current.
- **Life.** Lotus pads with pink buds lie on still water, and reeds grow along the banks.

## Work you can see

- **Woodcutting.** A woodcutter faces his tree and swings a two-handed axe. With the last cut the tree falls away from him, lies a while, and is hauled off as timber; a stump stays where it stood.
- **Fishing.** A fisher throws the Khmer cast net (សំណាញ់), then hauls it in hand over hand.
- **Boats.** People cross water standing in a dugout boat (ទូក) and paddle it, every boat in time with its rower.

## What we avoid

- Neon greens, and flat single-colour ground.
- Scattered spiky tufts on open land.
- Noisy screen-space AO or blurry plastic highlights on the water.
- Real reflections.
- Characters lit like the ground: they would sink into it.
- A thick Meshy tree between the 3D camera and the hero. The camera now stops in front of trees, as it does in front of walls.
