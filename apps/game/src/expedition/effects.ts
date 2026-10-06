import * as THREE from 'three';
import type { SkillConfig } from '@temples/shared';
import type { XZ } from './kulenMap';
import { heightAt } from './kulenMap';
import { seg as lpSeg } from '../engine/look';

/**
 * Light effects for attacks and blessings (prompt E07 preview): expanding rings, glowing
 * bursts, projectiles, beams and falling light, all additive and tinted with the skill's
 * colours from config (Indra's violet-white, Vishnu's gold and lapis, Shiva's saffron…).
 * A small pool of meshes is reused, so casting never allocates.
 */

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Live {
  kind: 'ring' | 'burst' | 'bolt' | 'beam' | 'column' | 'rain' | 'slash' | 'disc';
  start: number;
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
  color2: THREE.Color;
  size: number;
  obj: THREE.Object3D;
}

const additive = (color: THREE.ColorRepresentation, map?: THREE.Texture) =>
  new THREE.MeshBasicMaterial({
    color,
    map,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });

export class Effects {
  readonly group = new THREE.Group();
  private readonly live: Live[] = [];
  private readonly tex = glowTexture();
  private readonly ringGeo = new THREE.RingGeometry(0.85, 1, lpSeg(48, 4));
  private readonly slashGeo = new THREE.RingGeometry(0.7, 1, lpSeg(24, 4), 1, -0.9, 1.8);
  private readonly beamGeo = new THREE.CylinderGeometry(1, 1, 1, lpSeg(10, 3), 1, true);
  private readonly columnGeo = new THREE.CylinderGeometry(1, 1.4, 1, lpSeg(16, 3), 1, true);
  private readonly discGeo = new THREE.TorusGeometry(0.5, 0.12, lpSeg(6, 3), lpSeg(20, 4));

  /** Where things stand: ground height + offset. */
  private at(p: XZ, y = 1): THREE.Vector3 {
    return new THREE.Vector3(p[0], heightAt(p[0], p[1]) + y, p[1]);
  }

  private add(
    kind: Live['kind'],
    obj: THREE.Object3D,
    dur: number,
    from: THREE.Vector3,
    to: THREE.Vector3,
    c1: THREE.Color,
    c2: THREE.Color,
    size: number,
    now: number,
  ): void {
    this.group.add(obj);
    this.live.push({ kind, start: now, dur, from, to, color: c1, color2: c2, size, obj });
  }

  private sprite(color: THREE.Color): THREE.Sprite {
    return new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.tex,
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    );
  }

  /** Melee swing: a bright arc in front of the hero. */
  slash(from: XZ, to: XZ, now: number, color = '#fff2c0'): void {
    const m = new THREE.Mesh(this.slashGeo, additive(color));
    m.rotation.x = -Math.PI / 2;
    const f = this.at(from, 1.1);
    const t = this.at(to, 1.1);
    m.position.copy(f).lerp(t, 0.55);
    m.rotation.z = Math.atan2(t.z - f.z, t.x - f.x) * -1;
    this.add('slash', m, 260, f, t, new THREE.Color(color), new THREE.Color(color), 1.8, now);
    this.burst(to, now, color, 1.4, 250);
  }

  /** Ranged attack: a glowing orb flying to the target, then a small burst. */
  bolt(from: XZ, to: XZ, now: number, color = '#ffd166'): void {
    const s = this.sprite(new THREE.Color(color));
    this.add(
      'bolt',
      s,
      280,
      this.at(from, 1.6),
      this.at(to, 1.2),
      new THREE.Color(color),
      new THREE.Color(color),
      0.9,
      now,
    );
    this.burst(to, now + 260, color, 1.6, 300);
  }

  burst(p: XZ, now: number, color: string, size: number, dur = 450): void {
    const s = this.sprite(new THREE.Color(color));
    const v = this.at(p, 1.1);
    this.add('burst', s, dur, v, v, new THREE.Color(color), new THREE.Color(color), size, now);
  }

  ring(p: XZ, radius: number, now: number, color: string, dur = 600): void {
    const m = new THREE.Mesh(this.ringGeo, additive(color));
    m.rotation.x = -Math.PI / 2;
    const v = this.at(p, 0.15);
    this.add('ring', m, dur, v, v, new THREE.Color(color), new THREE.Color(color), radius, now);
  }

  /** A blessing: shape and colour follow the skill (see the heroes table in the spec). */
  skill(id: string, s: SkillConfig, from: XZ, center: XZ, now: number): void {
    const c1 = s.colors[0]!;
    const c2 = s.colors[1] ?? c1;
    const r = Math.max(2, s.radius);
    switch (s.effect) {
      case 'heal': {
        const m = new THREE.Mesh(this.columnGeo, additive(c1));
        const v = this.at(from, 0);
        this.add('column', m, 1100, v, v, new THREE.Color(c1), new THREE.Color(c2), 1.6, now);
        this.ring(from, r * 0.5, now, c2, 900);
        this.burst(from, now, c2, 3, 700);
        return;
      }
      case 'selfBlast':
        this.ring(from, r, now, c1, 650);
        this.ring(from, r * 0.7, now + 90, c2, 600);
        this.burst(from, now, c2, r * 0.8, 500);
        return;
      case 'dashStrike': {
        const m = new THREE.Mesh(this.beamGeo, additive(c1));
        this.add(
          'beam',
          m,
          420,
          this.at(from, 1),
          this.at(center, 1),
          new THREE.Color(c1),
          new THREE.Color(c2),
          0.45,
          now,
        );
        this.burst(center, now + 120, c2, 3.4, 500);
        this.ring(center, r, now + 120, c1, 500);
        return;
      }
      case 'blast':
        if (id === 'vajra' || id === 'shivaEye') {
          // Lightning / fire beam from the hero to the point.
          const m = new THREE.Mesh(this.beamGeo, additive(c1));
          this.add(
            'beam',
            m,
            id === 'shivaEye' ? 900 : 350,
            this.at(from, id === 'shivaEye' ? 1.7 : 1.3),
            this.at(center, 0.8),
            new THREE.Color(c1),
            new THREE.Color(c2),
            id === 'shivaEye' ? 0.7 : 0.25,
            now,
          );
        } else if (id === 'chakra') {
          const m = new THREE.Mesh(this.discGeo, additive(c1));
          this.add(
            'disc',
            m,
            420,
            this.at(from, 1.3),
            this.at(center, 1.1),
            new THREE.Color(c1),
            new THREE.Color(c2),
            1,
            now,
          );
        } else if (id === 'ramaArrows' || id === 'stampede') {
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            const p: XZ = [
              center[0] + Math.cos(a) * r * 0.55 * ((k % 3) / 2 + 0.3),
              center[1] + Math.sin(a) * r * 0.55 * ((k % 3) / 2 + 0.3),
            ];
            const sp = this.sprite(new THREE.Color(k % 2 ? c1 : c2));
            this.add(
              'rain',
              sp,
              500,
              this.at(p, 9 + (k % 4)),
              this.at(p, 0.5),
              new THREE.Color(c1),
              new THREE.Color(c2),
              0.8,
              now + k * 40,
            );
          }
        } else {
          const sp = this.sprite(new THREE.Color(c1));
          this.add(
            'bolt',
            sp,
            320,
            this.at(from, 1.6),
            this.at(center, 1.2),
            new THREE.Color(c1),
            new THREE.Color(c2),
            1.4,
            now,
          );
        }
        this.ring(center, r, now + 250, c1, 650);
        this.burst(center, now + 250, c2, r * 0.9, 600);
        return;
    }
  }

  update(now: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i]!;
      const k = (now - e.start) / e.dur;
      if (k < 0) {
        e.obj.visible = false;
        continue;
      }
      e.obj.visible = true;
      if (k >= 1) {
        this.group.remove(e.obj);
        const m = (e.obj as THREE.Mesh).material as THREE.Material | undefined;
        m?.dispose();
        this.live.splice(i, 1);
        continue;
      }
      const fade = 1 - k;
      const mat = (e.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
      switch (e.kind) {
        case 'ring':
          e.obj.position.copy(e.from);
          e.obj.scale.setScalar(e.size * (0.25 + 0.75 * Math.sqrt(k)));
          mat.opacity = fade;
          break;
        case 'burst':
          e.obj.position.copy(e.from);
          e.obj.scale.setScalar(e.size * (0.6 + 0.8 * k));
          mat.opacity = fade;
          break;
        case 'bolt':
        case 'rain':
          e.obj.position.copy(e.from).lerp(e.to, k);
          e.obj.scale.setScalar(e.size * (e.kind === 'rain' ? 1 : 1 + 0.4 * Math.sin(k * 20)));
          mat.opacity = 0.9;
          break;
        case 'disc':
          e.obj.position.copy(e.from).lerp(e.to, k);
          e.obj.rotation.set(Math.PI / 2, 0, now / 40);
          e.obj.scale.setScalar(1.4);
          mat.opacity = 0.95;
          break;
        case 'beam': {
          const mid = e.from.clone().lerp(e.to, 0.5);
          const len = e.from.distanceTo(e.to);
          e.obj.position.copy(mid);
          e.obj.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            e.to.clone().sub(e.from).normalize(),
          );
          const w = e.size * (0.6 + 0.4 * Math.sin(now / 25));
          e.obj.scale.set(w, len, w);
          mat.opacity = fade;
          mat.color.copy(e.color).lerp(e.color2, k);
          break;
        }
        case 'column':
          e.obj.position.copy(e.from).add(new THREE.Vector3(0, 2.5 * Math.min(1, k * 3), 0));
          e.obj.scale.set(e.size, 5 * Math.min(1, k * 3), e.size);
          mat.opacity = fade * 0.8;
          break;
        case 'slash':
          e.obj.scale.setScalar(e.size * (0.8 + 0.4 * k));
          mat.opacity = fade;
          break;
      }
    }
  }
}
