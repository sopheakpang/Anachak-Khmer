# Visual Bible — the Angkor Cel-Diorama look (1.7.0)

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
