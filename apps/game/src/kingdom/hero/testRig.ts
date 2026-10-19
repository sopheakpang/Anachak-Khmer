import * as THREE from 'three';

/** A small humanoid rig in a T-pose, Mixamo names, 100× scale (as Mixamo exports). */
export function fakeRig(prefix = 'mixamorig:', armsDown = false): THREE.Object3D {
  const b = (name: string, x: number, y: number, z = 0) => {
    const bone = new THREE.Bone();
    bone.name = prefix + name;
    bone.position.set(x, y, z);
    return bone;
  };
  const hips = b('Hips', 0, 95);
  const spine = b('Spine', 0, 12);
  const spine1 = b('Spine1', 0, 12);
  const neck = b('Neck', 0, 25);
  const head = b('Head', 0, 10);
  const lArm = b('LeftArm', 18, 20);
  const lFore = armsDown ? b('LeftForeArm', 12, -28) : b('LeftForeArm', 28, 0);
  const lHand = armsDown ? b('LeftHand', 1, -26) : b('LeftHand', 26, 0);
  const rArm = b('RightArm', -18, 20);
  const rFore = armsDown ? b('RightForeArm', -12, -28) : b('RightForeArm', -28, 0);
  const rHand = armsDown ? b('RightHand', -1, -26) : b('RightHand', -26, 0);
  const lUp = b('LeftUpLeg', 9, -5);
  const lLeg = b('LeftLeg', 0, -44);
  const lFoot = b('LeftFoot', 0, -42);
  const rUp = b('RightUpLeg', -9, -5);
  const rLeg = b('RightLeg', 0, -44);
  const rFoot = b('RightFoot', 0, -42);
  hips.add(spine, lUp, rUp);
  spine.add(spine1);
  spine1.add(neck, lArm, rArm);
  neck.add(head);
  lArm.add(lFore);
  lFore.add(lHand);
  rArm.add(rFore);
  rFore.add(rHand);
  lUp.add(lLeg);
  lLeg.add(lFoot);
  rUp.add(rLeg);
  rLeg.add(rFoot);
  const bones: THREE.Bone[] = [];
  hips.traverse((o) => bones.push(o as THREE.Bone));
  const geo = new THREE.BoxGeometry(40, 180, 20);
  geo.translate(0, 90, 0);
  const n = geo.getAttribute('position').count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n).fill([1, 0, 0, 0]).flat(), 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xc8a050 }));
  const root = new THREE.Group();
  root.add(hips, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  return root;
}
