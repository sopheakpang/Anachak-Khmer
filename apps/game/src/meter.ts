import type { WebGLRenderer } from 'three';

export interface FrameStats {
  fps: number;
  frameMs: number;
  heapMb: number | null;
  drawCalls: number;
  triangles: number;
  /** Post-processing (AO normals, glow, grade) on top of the scene, when it is on. */
  postCalls: number;
  postTriangles: number;
  frames: number;
}

/** The scene's share of the frame's counters, for views with post-processing. */
export interface SceneShare {
  sceneCalls: number;
  sceneTriangles: number;
}

interface ChromeMemory {
  usedJSHeapSize: number;
}

/** Rolling 1-second stats. Toggle the on-screen meter with F3. */
export class Meter {
  readonly stats: FrameStats = {
    fps: 0,
    frameMs: 0,
    heapMb: null,
    drawCalls: 0,
    triangles: 0,
    postCalls: 0,
    postTriangles: 0,
    frames: 0,
  };
  private readonly el: HTMLDivElement;
  private windowStart = performance.now();
  private windowFrames = 0;
  private workMs = 0;

  constructor(parent: HTMLElement, visible: boolean) {
    this.el = document.createElement('div');
    this.el.className = 'meter';
    this.el.hidden = !visible;
    parent.append(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.el.hidden = !this.el.hidden;
      }
    });
  }

  /** Call once per rendered frame with how long the frame's work took. */
  frame(renderer: WebGLRenderer, workMs: number, share: SceneShare | null = null): void {
    this.windowFrames++;
    this.stats.frames++;
    this.workMs += workMs;
    const now = performance.now();
    const elapsed = now - this.windowStart;
    if (elapsed < 1000) return;
    this.stats.fps = (this.windowFrames * 1000) / elapsed;
    this.stats.frameMs = this.workMs / this.windowFrames;
    const mem = (performance as unknown as { memory?: ChromeMemory }).memory;
    this.stats.heapMb = mem ? mem.usedJSHeapSize / 1048576 : null;
    const all = renderer.info.render;
    this.stats.drawCalls = share ? share.sceneCalls : all.calls;
    this.stats.triangles = share ? share.sceneTriangles : all.triangles;
    this.stats.postCalls = all.calls - this.stats.drawCalls;
    this.stats.postTriangles = all.triangles - this.stats.triangles;
    this.windowStart = now;
    this.windowFrames = 0;
    this.workMs = 0;
    const s = this.stats;
    this.el.textContent =
      `FPS ${s.fps.toFixed(1)}  ·  frame ${s.frameMs.toFixed(1)} ms\n` +
      `heap ${s.heapMb === null ? 'n/a' : s.heapMb.toFixed(0) + ' MB'}  ·  draws ${s.drawCalls}  ·  tris ${s.triangles}` +
      (s.postCalls ? `\npost  ·  draws ${s.postCalls}  ·  tris ${s.postTriangles}` : '');
  }
}
