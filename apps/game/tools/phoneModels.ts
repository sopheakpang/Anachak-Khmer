/**
 * PK 2026-10-20 (D163): the phone gets the PC's 3D models — the same files at the same paths, so
 * the same mapping (props.json, anachak.json) — but phone-sized: every texture larger than
 * `maxTexture` (config/quality.json mobile.modelTextureMax) is shrunk to fit it, the geometry
 * untouched. Shrunk copies are kept in a cache folder (apps/game/.phone-models/) keyed by the
 * source file's size and time, so a build only redoes the models that changed.
 *
 * Uses @gltf-transform and sharp, already in the repo for the model pipeline (scripts/models/).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/** Model folders the phone gets in their phone size (models/heroes/ stays PC only: unused since D155). */
export const PHONE_MODEL_DIRS = ['models/real', 'models/buildings'];

/** The size a texture of w×h gets so that neither side passes `max` (aspect kept; never larger). */
export function fitTexture(w: number, h: number, max: number): [number, number] {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

/** The cache key of a source model: its size and change time (a changed model is redone). */
export function cacheKey(size: number, mtimeMs: number, max: number): string {
  return `${size}:${Math.round(mtimeMs)}:${max}`;
}

/** Which models must be (re)made: those whose cached key is missing or different. */
export function toRedo(files: Record<string, string>, cache: Record<string, string>): string[] {
  return Object.keys(files)
    .filter((f) => cache[f] !== files[f])
    .sort();
}

function walkGlb(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walkGlb(p) : /\.glb$/i.test(name) ? [p] : [];
  });
}

/**
 * Replaces the build's copies of the PC models (in `out`) with phone-sized ones, making missing
 * ones from `src` (public-mobile) into `cacheDir`. Returns how many were remade and the bytes saved.
 */
export async function shrinkModels(
  src: string,
  out: string,
  cacheDir: string,
  maxTexture: number,
): Promise<{ made: number; files: number; saved: number }> {
  const indexFile = join(cacheDir, 'index.json');
  const cache: Record<string, string> = existsSync(indexFile)
    ? (JSON.parse(readFileSync(indexFile, 'utf8')) as Record<string, string>)
    : {};
  const files: Record<string, string> = {};
  for (const d of PHONE_MODEL_DIRS)
    for (const p of walkGlb(join(src, d))) {
      const st = statSync(p);
      files[relative(src, p).replace(/\\/g, '/')] = cacheKey(st.size, st.mtimeMs, maxTexture);
    }
  const redo = toRedo(files, cache);
  const missing = Object.keys(files).filter((f) => !existsSync(join(cacheDir, f)));
  const todo = [...new Set([...redo, ...missing])].sort();
  if (todo.length) {
    const [{ NodeIO }, { ALL_EXTENSIONS }, sharp] = await Promise.all([
      import('@gltf-transform/core'),
      import('@gltf-transform/extensions'),
      import('sharp').then((m) => m.default),
    ]);
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    for (const f of todo) {
      const doc = await io.read(join(src, f));
      const to = join(cacheDir, f);
      mkdirSync(dirname(to), { recursive: true });
      let shrunk = 0;
      for (const t of doc.getRoot().listTextures()) {
        const size = t.getSize();
        const img = t.getImage();
        if (!size || !img || Math.max(size[0], size[1]) <= maxTexture) continue;
        const [w, h] = fitTexture(size[0], size[1], maxTexture);
        // WebP stays WebP; PNG and JPEG become WebP too (the PC copies are WebP already, D154).
        t.setImage(new Uint8Array(await sharp(img).resize(w, h).webp({ quality: 85 }).toBuffer()));
        t.setMimeType('image/webp');
        shrunk++;
      }
      if (shrunk) {
        if (!doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_texture_webp'))
          doc.createExtension(ALL_EXTENSIONS.find((E) => E.EXTENSION_NAME === 'EXT_texture_webp')!);
        await io.write(to, doc);
      } else copyFileSync(join(src, f), to);
      cache[f] = files[f]!;
    }
    for (const f of Object.keys(cache)) if (!(f in files)) delete cache[f];
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(indexFile, JSON.stringify(cache, null, 1));
  }
  let saved = 0;
  for (const f of Object.keys(files)) {
    const dst = join(out, f);
    const before = existsSync(dst) ? statSync(dst).size : 0;
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(cacheDir, f), dst);
    saved += before - statSync(dst).size;
  }
  return { made: todo.length, files: Object.keys(files).length, saved };
}
