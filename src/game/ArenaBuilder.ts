import * as THREE from 'three';

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface RampZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: 'z';
  startZ: number;
  endZ: number;
  startY: number;
  endY: number;
}

export interface ArenaData {
  group: THREE.Group;
  obstacles: ObstacleBox[];
  ramps: RampZone[];
  elevatedDecks: ObstacleBox[];
  raycastMeshes: THREE.Mesh[];
  arenaHalfSize: number;
  spawnPoints: THREE.Vector3[];
  patrolPoints: THREE.Vector3[];
  dispose: () => void;
}

function makeConcreteTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#252c37';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt/concrete grain
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 30 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${v},${v + 5},${v + 12})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Tactical grid seams
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 2;
  for (let p = 0; p <= 512; p += 128) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = maxAniso;
  return tex;
}

function makeContainerTexture(baseHex: string, maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Corrugated ribs
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, 0, 5, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 5, 0, 3, 256);
  }

  // Hazard stripe band along bottom
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 224, 256, 14);
  ctx.fillStyle = '#111827';
  for (let x = -20; x < 276; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 224);
    ctx.lineTo(x + 12, 224);
    ctx.lineTo(x + 4, 238);
    ctx.lineTo(x - 8, 238);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function makeCrateTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5c4b37';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#3b2f21';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 242, 242);

  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(242, 242);
  ctx.moveTo(242, 14);
  ctx.lineTo(14, 242);
  ctx.lineWidth = 10;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function buildTacticalArena(renderer: THREE.WebGLRenderer): ArenaData {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const group = new THREE.Group();
  const obstacles: ObstacleBox[] = [];
  const ramps: RampZone[] = [];
  const elevatedDecks: ObstacleBox[] = [];
  const raycastMeshes: THREE.Mesh[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const track = <T extends { dispose: () => void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  // Extended Outer Terrain (260x260) so arena sits naturally in desert/industrial plateau
  const outerGroundMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b352f,
      roughness: 0.94,
      metalness: 0.04,
    }),
  );
  const outerGround = new THREE.Mesh(track(new THREE.PlaneGeometry(280, 280)), outerGroundMat);
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.04;
  outerGround.receiveShadow = true;
  group.add(outerGround);

  // Playable Tactical Compound Floor (74x74)
  const floorTex = track(makeConcreteTexture(maxAniso));
  const floorMat = track(
    new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.82,
      metalness: 0.12,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const arenaHalfSize = 35;
  const floorMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(74, 74)), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = 0;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);
  raycastMeshes.push(floorMesh);

  // Distant Canyon Ridges & Natural Perimeter (InstancedMesh > 20 items)
  const rockGeo = track(new THREE.DodecahedronGeometry(1, 0));
  const rockMat = track(new THREE.MeshStandardMaterial({ color: 0x4b4238, roughness: 0.92, metalness: 0.05 }));
  const rockCount = 44;
  const rockInstances = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < rockCount; i++) {
    const angle = (i / rockCount) * Math.PI * 2;
    const dist = 56 + (i % 4) * 11;
    dummy.position.set(Math.cos(angle) * dist, 3.2 + (i % 3) * 1.4, Math.sin(angle) * dist);
    dummy.rotation.set(0, angle * 1.7, 0);
    dummy.scale.set(6 + (i % 5) * 2.2, 4.5 + (i % 4) * 2.5, 5 + (i % 3) * 2);
    dummy.updateMatrix();
    rockInstances.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.08, 0.14, 0.22 + (i % 4) * 0.03);
    rockInstances.setColorAt(i, color);
  }
  rockInstances.instanceMatrix.needsUpdate = true;
  if (rockInstances.instanceColor) rockInstances.instanceColor.needsUpdate = true;
  rockInstances.computeBoundingSphere();
  group.add(rockInstances);

  // Perimeter Security Concrete Barriers + Fence Posts
  const barrierMat = track(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.15 }));
  const fencePostMat = track(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.85 }));
  const railMat = track(new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.6 }));

  for (let side = 0; side < 4; side++) {
    const wallGroup = new THREE.Group();
    const len = 72;
    const curb = new THREE.Mesh(track(new THREE.BoxGeometry(len, 1.4, 1.2)), barrierMat);
    curb.position.y = 0.7;
    curb.castShadow = true;
    curb.receiveShadow = true;
    wallGroup.add(curb);
    raycastMeshes.push(curb);

    const topRail = new THREE.Mesh(track(new THREE.BoxGeometry(len, 0.12, 0.16)), railMat);
    topRail.position.y = 2.6;
    wallGroup.add(topRail);

    for (let x = -34; x <= 34; x += 6.8) {
      const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.1, 2.7, 8)), fencePostMat);
      post.position.set(x, 1.35, 0);
      post.castShadow = true;
      wallGroup.add(post);
    }

    if (side === 0) wallGroup.position.set(0, 0, -36);
    if (side === 1) wallGroup.position.set(0, 0, 36);
    if (side === 2) {
      wallGroup.rotation.y = Math.PI / 2;
      wallGroup.position.set(-36, 0, 0);
    }
    if (side === 3) {
      wallGroup.rotation.y = Math.PI / 2;
      wallGroup.position.set(36, 0, 0);
    }
    group.add(wallGroup);
  }

  // Helper to add a grounded multi-part shipping container
  const containerBlueTex = track(makeContainerTexture('#264b6e', maxAniso));
  const containerRustTex = track(makeContainerTexture('#7c3a2d', maxAniso));
  const containerOliveTex = track(makeContainerTexture('#3b4d3b', maxAniso));
  const containerFrameMat = track(new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.85 }));

  const addContainer = (x: number, z: number, rotY: number, tex: THREE.CanvasTexture) => {
    const w = rotY === 0 ? 3.2 : 7.4;
    const d = rotY === 0 ? 7.4 : 3.2;
    const h = 3.1;

    const cGroup = new THREE.Group();
    cGroup.position.set(x, 0, z);

    const mat = track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.58, metalness: 0.42 }));
    const hull = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
    hull.position.y = h / 2;
    hull.castShadow = true;
    hull.receiveShadow = true;
    cGroup.add(hull);
    raycastMeshes.push(hull);

    // Top structural frame beams
    const roofTrim = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.12, 0.14, d + 0.12)), containerFrameMat);
    roofTrim.position.y = h - 0.05;
    cGroup.add(roofTrim);

    group.add(cGroup);
    obstacles.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: 0,
      maxY: h,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  };

  addContainer(-16, -12, 0, containerBlueTex);
  addContainer(16, 12, 0, containerRustTex);
  addContainer(-16, 14, Math.PI / 2, containerOliveTex);
  addContainer(16, -14, Math.PI / 2, containerBlueTex);

  // Central Elevated Tactical Bridge + 2 Ramps (North & South)
  const deckMat = track(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.35 }));
  const deckTrimMat = track(new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.6 }));

  const deckW = 9;
  const deckD = 9;
  const deckH = 2.0;
  const deckMesh = new THREE.Mesh(track(new THREE.BoxGeometry(deckW, 0.35, deckD)), deckMat);
  deckMesh.position.set(0, deckH - 0.175, 0);
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);
  raycastMeshes.push(deckMesh);

  // 4 Support Pillars under central deck
  [[-3.8, -3.8], [3.8, -3.8], [-3.8, 3.8], [3.8, 3.8]].forEach(([px, pz]) => {
    const pillar = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, deckH - 0.3, 0.7)), containerFrameMat);
    pillar.position.set(px, (deckH - 0.3) / 2, pz);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);
    raycastMeshes.push(pillar);
    obstacles.push({
      minX: px - 0.35,
      maxX: px + 0.35,
      minY: 0,
      maxY: deckH - 0.3,
      minZ: pz - 0.35,
      maxZ: pz + 0.35,
    });
  });

  elevatedDecks.push({
    minX: -deckW / 2,
    maxX: deckW / 2,
    minY: 0,
    maxY: deckH,
    minZ: -deckD / 2,
    maxZ: deckD / 2,
  });

  // Low chest-high cover walls on the central bridge East/West edges
  [-4.2, 4.2].forEach((cx) => {
    const parapet = new THREE.Mesh(track(new THREE.BoxGeometry(0.45, 1.05, 5.5)), deckMat);
    parapet.position.set(cx, deckH + 0.525, 0);
    parapet.castShadow = true;
    parapet.receiveShadow = true;
    group.add(parapet);
    raycastMeshes.push(parapet);

    const cap = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 0.1, 5.5)), deckTrimMat);
    cap.position.set(cx, deckH + 1.08, 0);
    group.add(cap);

    obstacles.push({
      minX: cx - 0.25,
      maxX: cx + 0.25,
      minY: deckH,
      maxY: deckH + 1.15,
      minZ: -2.75,
      maxZ: 2.75,
    });
  });

  // North & South Walkable Ramps leading onto central deck
  const addRamp = (zSign: -1 | 1) => {
    const startZ = zSign * 10.5;
    const endZ = zSign * 4.5;
    const length = Math.abs(startZ - endZ);
    const angle = Math.atan2(deckH, length);
    const hyp = Math.hypot(length, deckH);

    const rampMesh = new THREE.Mesh(track(new THREE.BoxGeometry(4.2, 0.26, hyp)), deckMat);
    rampMesh.position.set(0, deckH / 2 - 0.1, (startZ + endZ) / 2);
    rampMesh.rotation.x = zSign === -1 ? -angle : angle;
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    group.add(rampMesh);
    raycastMeshes.push(rampMesh);

    ramps.push({
      minX: -2.1,
      maxX: 2.1,
      minZ: Math.min(startZ, endZ),
      maxZ: Math.max(startZ, endZ),
      axis: 'z',
      startZ,
      endZ,
      startY: 0,
      endY: deckH,
    });
  };
  addRamp(-1);
  addRamp(1);

  // Tactical Supply Crate Clusters & Low Concrete Cover
  const crateTex = track(makeCrateTexture(maxAniso));
  const crateMat = track(new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.78, metalness: 0.08 }));

  const addCrateStack = (x: number, z: number, size: number) => {
    const crate = new THREE.Mesh(track(new THREE.BoxGeometry(size, size, size)), crateMat);
    crate.position.set(x, size / 2, z);
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);
    raycastMeshes.push(crate);

    // Metal corner brackets
    const cap = new THREE.Mesh(track(new THREE.BoxGeometry(size + 0.06, 0.12, size + 0.06)), containerFrameMat);
    cap.position.set(x, size - 0.06, z);
    group.add(cap);

    obstacles.push({
      minX: x - size / 2,
      maxX: x + size / 2,
      minY: 0,
      maxY: size,
      minZ: z - size / 2,
      maxZ: z + size / 2,
    });
  };

  addCrateStack(-8, -3, 1.7);
  addCrateStack(-8, -1.2, 1.3);
  addCrateStack(8, 3, 1.7);
  addCrateStack(8, 1.2, 1.3);
  addCrateStack(-24, 0, 2.1);
  addCrateStack(24, 0, 2.1);
  addCrateStack(0, -20, 1.9);
  addCrateStack(0, 20, 1.9);
  addCrateStack(-10, -23, 1.6);
  addCrateStack(10, 23, 1.6);

  // Corner Watchtower Silhouettes (just outside perimeter, grounding the compound)
  [[-33, -33], [33, -33], [-33, 33], [33, 33]].forEach(([tx, tz]) => {
    const tower = new THREE.Group();
    tower.position.set(tx, 0, tz);
    const base = new THREE.Mesh(track(new THREE.BoxGeometry(3.2, 4.8, 3.2)), containerFrameMat);
    base.position.y = 2.4;
    base.castShadow = true;
    base.receiveShadow = true;
    tower.add(base);
    raycastMeshes.push(base);

    const beacon = new THREE.Mesh(
      track(new THREE.BoxGeometry(3.6, 0.4, 3.6)),
      track(new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.7 })),
    );
    beacon.position.y = 5.0;
    tower.add(beacon);

    group.add(tower);
    obstacles.push({
      minX: tx - 1.65,
      maxX: tx + 1.65,
      minY: 0,
      maxY: 5.5,
      minZ: tz - 1.65,
      maxZ: tz + 1.65,
    });
  });

  const spawnPoints = [
    new THREE.Vector3(-25, 0, -25),
    new THREE.Vector3(25, 0, 25),
    new THREE.Vector3(-25, 0, 25),
    new THREE.Vector3(25, 0, -25),
    new THREE.Vector3(0, 0, -27),
    new THREE.Vector3(0, 0, 27),
    new THREE.Vector3(-27, 0, 0),
    new THREE.Vector3(27, 0, 0),
  ];

  const patrolPoints = [
    new THREE.Vector3(0, 2.0, 0),
    new THREE.Vector3(-12, 0, -6),
    new THREE.Vector3(12, 0, 6),
    new THREE.Vector3(-12, 0, 8),
    new THREE.Vector3(12, 0, -8),
    new THREE.Vector3(0, 0, -16),
    new THREE.Vector3(0, 0, 16),
    new THREE.Vector3(-21, 0, -18),
    new THREE.Vector3(21, 0, 18),
  ];

  return {
    group,
    obstacles,
    ramps,
    elevatedDecks,
    raycastMeshes,
    arenaHalfSize,
    spawnPoints,
    patrolPoints,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function getGroundHeightAt(arena: ArenaData, x: number, z: number, currentY: number): number {
  let height = 0;

  for (const r of arena.ramps) {
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
      const t = THREE.MathUtils.clamp((z - r.startZ) / (r.endZ - r.startZ), 0, 1);
      height = Math.max(height, THREE.MathUtils.lerp(r.startY, r.endY, t));
    }
  }

  for (const d of arena.elevatedDecks) {
    if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ && currentY >= d.maxY - 0.65) {
      height = Math.max(height, d.maxY);
    }
  }

  return height;
}

export function resolveObstacleCollision(
  arena: ArenaData,
  pos: THREE.Vector3,
  radius: number,
  actorY: number,
) {
  pos.x = THREE.MathUtils.clamp(pos.x, -arena.arenaHalfSize, arena.arenaHalfSize);
  pos.z = THREE.MathUtils.clamp(pos.z, -arena.arenaHalfSize, arena.arenaHalfSize);

  for (const box of arena.obstacles) {
    if (actorY >= box.maxY - 0.15 || actorY + 1.8 <= box.minY) continue;

    const closestX = THREE.MathUtils.clamp(pos.x, box.minX, box.maxX);
    const closestZ = THREE.MathUtils.clamp(pos.z, box.minZ, box.maxZ);
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist > 0.0001) {
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      } else {
        pos.x += radius;
      }
    }
  }
}
