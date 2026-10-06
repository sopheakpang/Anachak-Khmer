import * as THREE from 'three';

/**
 * Carved names (prompt 10). One 2048×2048 canvas holds up to 128 names (256×128 cells);
 * all plates are one mesh rebuilt when the set changes — one draw call for every name.
 * Cells are reused oldest-first, so the newest names always have a place.
 */
export class NameAtlas {
  static readonly COLS = 8;
  static readonly ROWS = 16;
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D | null;
  private cells = new Map<string, number>(); // key → cell
  private order: string[] = []; // oldest first

  constructor(
    private readonly font: (px: number) => string,
    readonly capacity = NameAtlas.COLS * NameAtlas.ROWS,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2048;
    this.canvas.height = 2048;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** Cell index for a key, drawing the name if it is new. */
  cellFor(key: string, name: string): number {
    const existing = this.cells.get(key);
    if (existing !== undefined) {
      this.order = this.order.filter((k) => k !== key).concat(key);
      return existing;
    }
    let cell: number;
    if (this.cells.size < this.capacity) {
      cell = this.cells.size;
    } else {
      const oldest = this.order.shift()!;
      cell = this.cells.get(oldest)!;
      this.cells.delete(oldest);
    }
    this.cells.set(key, cell);
    this.order.push(key);
    this.draw(cell, name);
    return cell;
  }

  has(key: string): boolean {
    return this.cells.has(key);
  }

  clear(): void {
    this.cells.clear();
    this.order = [];
    this.g?.clearRect(0, 0, 2048, 2048);
    this.texture.needsUpdate = true;
  }

  /** UV rectangle [u0, v0, u1, v1] of a cell. */
  uv(cell: number): [number, number, number, number] {
    const cx = cell % NameAtlas.COLS;
    const cy = Math.floor(cell / NameAtlas.COLS);
    const u0 = cx / NameAtlas.COLS;
    const v1 = 1 - cy / NameAtlas.ROWS;
    return [u0, v1 - 1 / NameAtlas.ROWS, u0 + 1 / NameAtlas.COLS, v1];
  }

  private draw(cell: number, name: string): void {
    const g = this.g;
    if (!g) return;
    const x = (cell % NameAtlas.COLS) * 256;
    const y = Math.floor(cell / NameAtlas.COLS) * 128;
    g.clearRect(x, y, 256, 128);
    g.save();
    g.beginPath();
    g.rect(x, y, 256, 128);
    g.clip();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = 62;
    g.font = this.font(px);
    while (g.measureText(name).width > 236 && px > 26) {
      px -= 4;
      g.font = this.font(px);
    }
    // Carved look: light lower edge, dark cut.
    g.fillStyle = 'rgba(255,244,215,0.55)';
    g.fillText(name, x + 128 + 2, y + 66 + 3);
    g.fillStyle = 'rgba(52,36,20,0.92)';
    g.fillText(name, x + 128, y + 66);
    g.restore();
    this.texture.needsUpdate = true;
  }
}

export interface PlateSpec {
  key: string;
  name: string;
  /** Centre of the plate on the block's front face (world units, temple-local). */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

/** All plates as one mesh. */
export class NamePlates {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();

  constructor(readonly atlas: NameAtlas) {
    const mat = new THREE.MeshBasicMaterial({
      toneMapped: false,
      map: atlas.texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.Mesh(this.geometry, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  set(plates: PlateSpec[]): void {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    plates.forEach((p, i) => {
      const cell = this.atlas.cellFor(p.key, p.name);
      const [u0, v0, u1, v1] = this.atlas.uv(cell);
      // Keep the cell's 2:1 shape inside the block face.
      const w = Math.min(p.w * 0.94, p.h * 0.94 * 2);
      const h = w / 2;
      const x0 = p.x - w / 2;
      const x1 = p.x + w / 2;
      const y0 = p.y - h / 2;
      const y1 = p.y + h / 2;
      pos.push(x0, y0, p.z, x1, y0, p.z, x1, y1, p.z, x0, y1, p.z);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.geometry.setIndex(idx);
    this.geometry.computeBoundingSphere();
  }
}
