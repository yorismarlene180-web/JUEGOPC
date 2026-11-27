import * as THREE from 'three';
import { getShopItem } from '../data/catalog';
import type { AvatarLoadout } from '../types/game';

export interface CharacterRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  muzzlePoint: THREE.Object3D;
  speakingRing: THREE.Mesh;
  hitMaterials: THREE.MeshStandardMaterial[];
  dispose: () => void;
}

export interface FirstPersonWeaponRig {
  root: THREE.Group;
  muzzleFlash: THREE.Mesh;
  muzzleLight: THREE.PointLight;
  dispose: () => void;
}

function makeMat(
  color: string | number,
  roughness: number,
  metalness: number,
  emissive?: string,
  emissiveIntensity = 0.8,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness,
    emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0x000000),
    emissiveIntensity: emissive ? emissiveIntensity : 0,
  });
}

export function buildOperatorAvatar(
  loadout: AvatarLoadout,
  entityId: string,
  teamTint?: string,
): CharacterRig {
  const helmetSpec = getShopItem(loadout.helmet);
  const armorSpec = getShopItem(loadout.armor);
  const pantsSpec = getShopItem(loadout.pants || 'pants_classic_cargo');
  const packSpec = getShopItem(loadout.backpack);
  const weaponSpec = getShopItem(loadout.weaponSkin);

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const disposables: Array<{ dispose: () => void }> = [];
  const hitMaterials: THREE.MeshStandardMaterial[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.MeshStandardMaterial>(m: T): T => {
    disposables.push(m);
    hitMaterials.push(m);
    return m;
  };

  // Materials with deliberate roughness/metalness contrast
  const skinMat = trackMat(makeMat('#d29973', 0.78, 0.04));
  const undersuitMat = trackMat(makeMat('#1a202c', 0.85, 0.08));
  const pantsPrimaryMat = trackMat(makeMat(pantsSpec.primaryColor, pantsSpec.roughness, pantsSpec.metalness));
  const pantsAccentMat = trackMat(makeMat(pantsSpec.accentColor, Math.max(0.25, pantsSpec.roughness - 0.15), Math.min(0.6, pantsSpec.metalness + 0.1)));
  const armorPrimaryMat = trackMat(
    makeMat(teamTint || armorSpec.primaryColor, armorSpec.roughness, armorSpec.metalness),
  );
  const armorAccentMat = trackMat(
    makeMat(armorSpec.accentColor, Math.max(0.18, armorSpec.roughness - 0.2), Math.min(0.95, armorSpec.metalness + 0.2), armorSpec.emissive, 0.75),
  );
  const helmetMat = trackMat(makeMat(helmetSpec.primaryColor, helmetSpec.roughness, helmetSpec.metalness));
  const visorMat = trackMat(
    makeMat(helmetSpec.accentColor, 0.12, 0.9, helmetSpec.emissive || helmetSpec.accentColor, helmetSpec.emissive ? 1.2 : 0),
  );
  const packMat = trackMat(makeMat(packSpec.primaryColor, packSpec.roughness, packSpec.metalness));
  const packAccentMat = trackMat(
    makeMat(packSpec.accentColor, 0.25, 0.7, packSpec.emissive, 1.1),
  );
  const gunPrimaryMat = trackMat(makeMat(weaponSpec.primaryColor, weaponSpec.roughness, weaponSpec.metalness));
  const gunDarkMat = trackMat(makeMat('#0f172a', 0.42, 0.82));
  const isSneakers = loadout.pants === 'pants_blue_jeans' || loadout.pants === 'pants_sport_joggers' || loadout.pants === 'pants_white_elite';
  const bootMat = trackMat(makeMat(isSneakers ? pantsSpec.accentColor : '#111827', isSneakers ? 0.52 : 0.78, 0.12));

  const tagMesh = (mesh: THREE.Mesh, isHead = false) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.entityId = entityId;
    mesh.userData.isHead = isHead;
  };

  // Legs & Classic Pants + Footwear (grounded at y = 0)
  const createLeg = (xOffset: number) => {
    const leg = new THREE.Group();
    leg.position.set(xOffset, 0.82, 0);

    const thigh = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.11, 0.26, 4, 8)), pantsPrimaryMat);
    thigh.position.y = -0.22;
    tagMesh(thigh);
    leg.add(thigh);

    const lowerLeg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.19, 0.34, 0.2)), pantsPrimaryMat);
    lowerLeg.position.set(0, -0.52, 0.01);
    tagMesh(lowerLeg);
    leg.add(lowerLeg);

    if (loadout.pants === 'pants_classic_cargo' || loadout.pants === 'pants_camo_tactical') {
      const pocket = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.14, 0.14)), pantsAccentMat);
      pocket.position.set(xOffset < 0 ? -0.02 : 0.02, -0.26, 0.02);
      tagMesh(pocket);
      leg.add(pocket);
    } else if (loadout.pants === 'pants_sport_joggers' || loadout.pants === 'pants_white_elite') {
      const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.03, 0.56, 0.04)), pantsAccentMat);
      stripe.position.set(xOffset < 0 ? -0.1 : 0.1, -0.36, 0.01);
      tagMesh(stripe);
      leg.add(stripe);
    }

    const boot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.2, 0.14, 0.3)), bootMat);
    boot.position.set(0, -0.75, 0.04);
    tagMesh(boot);
    leg.add(boot);

    return leg;
  };

  const leftLeg = createLeg(-0.16);
  const rightLeg = createLeg(0.16);
  bodyGroup.add(leftLeg, rightLeg);

  // Pelvis & Belt
  const pelvis = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.48, 0.18, 0.28)), pantsPrimaryMat);
  pelvis.position.y = 0.86;
  tagMesh(pelvis);
  bodyGroup.add(pelvis);

  const belt = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 0.055, 0.3)), gunDarkMat);
  belt.position.y = 0.94;
  tagMesh(belt);
  bodyGroup.add(belt);

  // Torso: Classic Clothing vs Tactical Armor
  const isClassicTop =
    loadout.armor === 'top_classic_tee' ||
    loadout.armor === 'top_leather_jacket' ||
    loadout.armor === 'top_red_hoodie' ||
    loadout.armor === 'top_aviator_gold';

  const torso = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.52, 0.56, 0.32)), armorPrimaryMat);
  torso.position.y = 1.22;
  tagMesh(torso);
  bodyGroup.add(torso);

  if (loadout.armor === 'top_classic_tee') {
    // Classic tee chest harness strap
    const strapL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.07, 0.54, 0.34)), gunDarkMat);
    strapL.position.set(-0.14, 1.22, 0.01);
    const strapR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.07, 0.54, 0.34)), gunDarkMat);
    strapR.position.set(0.14, 1.22, 0.01);
    const badge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.1, 0.34)), armorAccentMat);
    badge.position.set(0, 1.32, 0.01);
    tagMesh(strapL);
    tagMesh(strapR);
    tagMesh(badge);
    bodyGroup.add(strapL, strapR, badge);
  } else if (loadout.armor === 'top_leather_jacket' || loadout.armor === 'top_aviator_gold') {
    // Classic jacket collar + front zipper + undershirt V
    const innerShirt = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.44, 0.33)), armorAccentMat);
    innerShirt.position.set(0, 1.22, 0.01);
    const collar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.1, 0.34)), armorPrimaryMat);
    collar.position.set(0, 1.5, -0.01);
    const zipper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.035, 0.5, 0.345)), visorMat);
    zipper.position.set(0, 1.22, 0.01);
    tagMesh(innerShirt);
    tagMesh(collar);
    tagMesh(zipper);
    bodyGroup.add(innerShirt, collar, zipper);
  } else if (loadout.armor === 'top_red_hoodie') {
    // Classic hoodie pocket + hood collar
    const pocket = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.16, 0.34)), armorPrimaryMat);
    pocket.position.set(0, 1.07, 0.015);
    const hoodBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.38, 0.14, 0.2)), armorPrimaryMat);
    hoodBack.position.set(0, 1.51, -0.14);
    const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.06, 0.34)), armorAccentMat);
    stripe.position.set(0, 1.29, 0.01);
    tagMesh(pocket);
    tagMesh(hoodBack);
    tagMesh(stripe);
    bodyGroup.add(pocket, hoodBack, stripe);
  } else {
    const chestPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.44, 0.36, 0.36)), armorAccentMat);
    chestPlate.position.set(0, 1.27, 0.01);
    tagMesh(chestPlate);
    bodyGroup.add(chestPlate);

    // Shoulder Pads for tactical armors
    [-0.33, 0.33].forEach((xPos) => {
      const pad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.18, 0.26)), armorAccentMat);
      pad.position.set(xPos, 1.44, 0);
      pad.rotation.z = xPos < 0 ? 0.18 : -0.18;
      tagMesh(pad);
      bodyGroup.add(pad);
    });
  }

  // Backpack Module (varied by loadout)
  const backpack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.4, 0.16)), packMat);
  backpack.position.set(0, 1.24, -0.24);
  tagMesh(backpack);
  bodyGroup.add(backpack);

  if (loadout.backpack === 'pack_comms_antenna') {
    const antenna = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.012, 0.018, 0.55, 8)), packAccentMat);
    antenna.position.set(0.12, 1.64, -0.25);
    tagMesh(antenna);
    bodyGroup.add(antenna);
  } else if (loadout.backpack === 'pack_thruster') {
    [-0.1, 0.1].forEach((nx) => {
      const nozzle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.045, 0.065, 0.16, 10)), packAccentMat);
      nozzle.position.set(nx, 1.02, -0.28);
      nozzle.rotation.x = 0.25;
      tagMesh(nozzle);
      bodyGroup.add(nozzle);
    });
  } else {
    const strap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.08, 0.18)), packAccentMat);
    strap.position.set(0, 1.24, -0.25);
    tagMesh(strap);
    bodyGroup.add(strap);
  }

  // Head & Classic Headgear / Helmet Group (marked isHead = true for real headshot hitboxes)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.66, 0);

  const isClassicHeadgear =
    loadout.helmet === 'head_classic_cap' ||
    loadout.helmet === 'head_black_bandana' ||
    loadout.helmet === 'head_red_beret';

  if (isClassicHeadgear) {
    // Exposed head with hair + classic eyewear/cap/bandana/beret
    const face = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.19, 14, 12)), skinMat);
    face.scale.set(0.95, 1.05, 1.0);
    tagMesh(face, true);
    headGroup.add(face);

    const sunglasses = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.31, 0.075, 0.12)), gunDarkMat);
    sunglasses.position.set(0, 0.03, 0.145);
    tagMesh(sunglasses, true);
    headGroup.add(sunglasses);

    if (loadout.helmet === 'head_classic_cap') {
      const capDome = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.205, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56)), helmetMat);
      capDome.position.set(0, 0.02, 0);
      const capBrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.025, 0.22)), helmetMat);
      capBrim.position.set(0, 0.06, 0.2);
      capBrim.rotation.x = 0.14;
      const capLogo = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.05, 0.03)), visorMat);
      capLogo.position.set(0, 0.12, 0.18);
      tagMesh(capDome, true);
      tagMesh(capBrim, true);
      tagMesh(capLogo, true);
      headGroup.add(capDome, capBrim, capLogo);
    } else if (loadout.helmet === 'head_black_bandana') {
      const hair = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), gunDarkMat);
      hair.position.set(0, 0.02, -0.01);
      const mask = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.185, 0.175, 0.15, 12)), helmetMat);
      mask.position.set(0, -0.08, 0.025);
      const skullPatch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.06, 0.04)), visorMat);
      skullPatch.position.set(0, -0.08, 0.19);
      tagMesh(hair, true);
      tagMesh(mask, true);
      tagMesh(skullPatch, true);
      headGroup.add(hair, mask, skullPatch);
    } else if (loadout.helmet === 'head_red_beret') {
      const beret = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.21, 0.195, 0.11, 14)), helmetMat);
      beret.position.set(-0.02, 0.14, 0);
      beret.rotation.z = 0.2;
      const crest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.06, 0.03)), visorMat);
      crest.position.set(0.06, 0.15, 0.185);
      tagMesh(beret, true);
      tagMesh(crest, true);
      headGroup.add(beret, crest);
    }
  } else {
    const helmetBase = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.21, 14, 12)), helmetMat);
    helmetBase.scale.set(1, 1.05, 1.08);
    tagMesh(helmetBase, true);
    headGroup.add(helmetBase);

    const visor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.11, 0.16)), visorMat);
    visor.position.set(0, 0.02, 0.14);
    tagMesh(visor, true);
    headGroup.add(visor);

    if (loadout.helmet === 'helmet_titan_gold' || loadout.helmet === 'helmet_crimson_spec') {
      const crest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.07, 0.1, 0.34)), visorMat);
      crest.position.set(0, 0.2, -0.01);
      tagMesh(crest, true);
      headGroup.add(crest);
    }
  }
  bodyGroup.add(headGroup);

  // Arms & Weapon (sleeves match classic jacket/hoodie or tactical undersuit)
  const sleeveMat = isClassicTop && loadout.armor !== 'top_classic_tee' ? armorPrimaryMat : skinMat;
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.33, 1.42, 0);
  const leftArmMesh = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.08, 0.38, 4, 8)), sleeveMat);
  leftArmMesh.position.set(0, -0.2, 0.14);
  leftArmMesh.rotation.x = -Math.PI / 3;
  tagMesh(leftArmMesh);
  leftArm.add(leftArmMesh);
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.33, 1.42, 0);
  const rightArmMesh = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.08, 0.38, 4, 8)), sleeveMat);
  rightArmMesh.position.set(0, -0.18, 0.18);
  rightArmMesh.rotation.x = -Math.PI / 2.4;
  tagMesh(rightArmMesh);
  rightArm.add(rightArmMesh);

  // Tactical Rifle attached to right arm
  const rifle = new THREE.Group();
  rifle.position.set(-0.08, -0.22, 0.42);
  const receiver = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.12, 0.48)), gunPrimaryMat);
  const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.02, 0.024, 0.42, 10)), gunDarkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, 0.36);
  const mag = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.055, 0.16, 0.09)), gunDarkMat);
  mag.position.set(0, -0.12, 0.06);
  mag.rotation.x = 0.2;
  tagMesh(receiver);
  tagMesh(barrel);
  tagMesh(mag);
  rifle.add(receiver, barrel, mag);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.02, 0.6);
  rifle.add(muzzlePoint);
  rightArm.add(rifle);
  bodyGroup.add(rightArm);

  // Voice Speaking Halo above operator head (hidden unless speaking)
  const speakingRingMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  disposables.push(speakingRingMat);
  const speakingRing = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(0.24, 0.3, 24)),
    speakingRingMat,
  );
  speakingRing.rotation.x = -Math.PI / 2;
  speakingRing.position.set(0, 2.08, 0);
  speakingRing.visible = false;
  root.add(speakingRing);

  return {
    root,
    bodyGroup,
    headGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    muzzlePoint,
    speakingRing,
    hitMaterials,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function buildFirstPersonWeapon(loadout: AvatarLoadout): FirstPersonWeaponRig {
  const weaponSpec = getShopItem(loadout.weaponSkin);
  const tracerSpec = getShopItem(loadout.tracer);

  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const bodyMat = track(makeMat(weaponSpec.primaryColor, weaponSpec.roughness, weaponSpec.metalness));
  const accentMat = track(
    makeMat(weaponSpec.accentColor, 0.3, 0.85, weaponSpec.emissive, 0.45),
  );
  const steelMat = track(makeMat('#0f172a', 0.28, 0.9));
  const opticGlassMat = track(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(tracerSpec.primaryColor),
      transparent: true,
      opacity: 0.35,
    }),
  );
  disposables.push(opticGlassMat);

  // Receiver
  const receiver = new THREE.Mesh(track(new THREE.BoxGeometry(0.085, 0.11, 0.46)), bodyMat);
  receiver.position.set(0, 0, -0.15);

  // Handguard shroud
  const handguard = new THREE.Mesh(track(new THREE.BoxGeometry(0.075, 0.085, 0.34)), accentMat);
  handguard.position.set(0, 0.015, -0.52);

  // Barrel & Suppressor
  const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.02, 0.25, 12)), steelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.018, -0.78);

  const suppressor = new THREE.Mesh(track(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 14)), steelMat);
  suppressor.rotation.x = Math.PI / 2;
  suppressor.position.set(0, 0.018, -0.95);

  // Top Picatinny Rail
  const rail = new THREE.Mesh(track(new THREE.BoxGeometry(0.042, 0.018, 0.54)), steelMat);
  rail.position.set(0, 0.064, -0.3);

  // Holographic Sight Frame + Dot
  const sightFrame = new THREE.Mesh(track(new THREE.BoxGeometry(0.056, 0.056, 0.09)), steelMat);
  sightFrame.position.set(0, 0.098, -0.18);
  const sightLens = new THREE.Mesh(track(new THREE.PlaneGeometry(0.042, 0.04)), opticGlassMat);
  sightLens.position.set(0, 0.098, -0.132);
  const sightDotMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(tracerSpec.primaryColor) }));
  const sightDot = new THREE.Mesh(track(new THREE.CircleGeometry(0.004, 8)), sightDotMat);
  sightDot.position.set(0, 0.098, -0.13);

  // Magazine & Grip
  const mag = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.18, 0.09)), steelMat);
  mag.position.set(0, -0.13, -0.22);
  mag.rotation.x = -0.22;

  const grip = new THREE.Mesh(track(new THREE.BoxGeometry(0.045, 0.14, 0.065)), accentMat);
  grip.position.set(0, -0.11, -0.02);
  grip.rotation.x = 0.28;

  // Muzzle flash
  const flashMat = track(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(tracerSpec.primaryColor),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    }),
  );
  const muzzleFlash = new THREE.Mesh(track(new THREE.ConeGeometry(0.07, 0.22, 7)), flashMat);
  muzzleFlash.rotation.x = -Math.PI / 2;
  muzzleFlash.position.set(0, 0.018, -1.14);
  muzzleFlash.visible = false;

  const muzzleLight = new THREE.PointLight(new THREE.Color(tracerSpec.primaryColor), 0, 6);
  muzzleLight.position.set(0, 0.03, -1.1);

  root.add(
    receiver,
    handguard,
    barrel,
    suppressor,
    rail,
    sightFrame,
    sightLens,
    sightDot,
    mag,
    grip,
    muzzleFlash,
    muzzleLight,
  );

  return {
    root,
    muzzleFlash,
    muzzleLight,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
