import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getShopItem } from '../data/catalog';
import { soundEngine } from '../audio/soundEngine';
import type { AvatarLoadout, KillFeedEvent, MatchSummary, RoomPlayerState } from '../types/game';
import { buildTacticalArena, getGroundHeightAt, resolveObstacleCollision, type ArenaData } from './ArenaBuilder';
import { buildFirstPersonWeapon, buildOperatorAvatar, type CharacterRig, type FirstPersonWeaponRig } from './AvatarBuilder';

export type EngineViewMode = 'title' | 'shop' | 'playing';
export type BotDifficulty = 'recluta' | 'veterano' | 'elite';

export interface HudSnapshot {
  hp: number;
  ammo: number;
  maxAmmo: number;
  reserveAmmo: number;
  reloading: boolean;
  reloadProgress: number;
  stamina: number;
  kills: number;
  deaths: number;
  headshots: number;
  score: number;
  timeRemaining: number;
  killTarget: number;
  hitmarker: 'none' | 'body' | 'head';
  damageFlash: number;
  crosshairSpread: number;
  pointerLocked: boolean;
  alive: boolean;
  respawnIn: number;
  killFeed: KillFeedEvent[];
  scoreboard: Array<{
    id: string;
    name: string;
    clanTag: string;
    kills: number;
    deaths: number;
    score: number;
    isSelf: boolean;
    isBot: boolean;
    isSpeaking?: boolean;
  }>;
}

interface BotActor {
  id: string;
  name: string;
  clanTag: string;
  rig: CharacterRig;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  hp: number;
  alive: boolean;
  respawnTimer: number;
  kills: number;
  deaths: number;
  score: number;
  patrolTarget: THREE.Vector3;
  fireCooldown: number;
  windupTimer: number;
  hitFlashTimer: number;
  strafeDir: number;
  strafeTimer: number;
  laserLine: THREE.Line;
}

interface RemoteActor {
  state: RoomPlayerState;
  rig: CharacterRig;
  targetPos: THREE.Vector3;
  targetYaw: number;
  hitFlashTimer: number;
}

interface TracerBeam {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onMatchEnd: (summary: MatchSummary) => void;
  onPauseToggle: () => void;
  onToggleChat: () => void;
  onToggleMic: () => void;
  onToggleScoreboard: (visible: boolean) => void;
  onMultiplayerMove?: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
  onMultiplayerShoot?: (origin: [number, number, number], hitPoint: [number, number, number]) => void;
  onMultiplayerHit?: (targetId: string, headshot: boolean) => void;
}

// Pre-allocated math helpers outside render loop (zero GC)
const _vec3 = new THREE.Vector3();
const _vec3b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _up = new THREE.Vector3(0, 1, 0);

const BOT_PROFILES: Array<{ name: string; clanTag: string; loadout: AvatarLoadout }> = [
  {
    name: 'Valkiria-01',
    clanTag: 'BOT',
    loadout: { helmet: 'helmet_amber_recon', armor: 'armor_obsidian', backpack: 'pack_comms_antenna', weaponSkin: 'skin_graphite', tracer: 'tracer_amber' },
  },
  {
    name: 'Centinela-02',
    clanTag: 'BOT',
    loadout: { helmet: 'helmet_crimson_spec', armor: 'armor_cobalt_vanguard', backpack: 'pack_thruster', weaponSkin: 'skin_crimson_alloy', tracer: 'tracer_crimson' },
  },
  {
    name: 'Lobo-03',
    clanTag: 'BOT',
    loadout: { helmet: 'helmet_ranger', armor: 'armor_arctic_wolf', backpack: 'pack_standard', weaponSkin: 'skin_desert_sand', tracer: 'tracer_cyan' },
  },
  {
    name: 'Titán-04',
    clanTag: 'BOT',
    loadout: { helmet: 'helmet_titan_gold', armor: 'armor_apex_gold', backpack: 'pack_thruster', weaponSkin: 'skin_gold_prestige', tracer: 'tracer_emerald' },
  },
  {
    name: 'Espectro-05',
    clanTag: 'BOT',
    loadout: { helmet: 'helmet_crimson_spec', armor: 'armor_obsidian', backpack: 'pack_comms_antenna', weaponSkin: 'skin_graphite', tracer: 'tracer_amber' },
  },
];

export class BattlePlayersEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private arena: ArenaData;
  private isSoftwareGl: boolean;
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;

  private callbacks: EngineCallbacks;
  private viewMode: EngineViewMode = 'title';
  private paused = false;
  private chatOpen = false;

  // Player state
  private playerId = 'local';
  private playerName = 'Operador';
  private playerClanTag = '';
  private playerLoadout: AvatarLoadout;
  private sensitivity = 0.0022;

  private playerPos = new THREE.Vector3(0, 0, 22);
  private playerVel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private onGround = true;
  private hp = 100;
  private alive = true;
  private respawnTimer = 0;
  private stamina = 100;

  // Weapon state
  private fpWeapon: FirstPersonWeaponRig | null = null;
  private ammo = 30;
  private maxAmmo = 30;
  private reserveAmmo = 150;
  private reloading = false;
  private reloadTimer = 0;
  private reloadDuration = 1.15;
  private fireCooldown = 0;
  private recoilPitch = 0;
  private weaponKick = 0;
  private muzzleFlashTimer = 0;
  private cameraShake = 0;
  private hitstopTimer = 0;
  private hitmarkerState: 'none' | 'body' | 'head' = 'none';
  private hitmarkerTimer = 0;
  private damageFlash = 0;

  // Match stats
  private matchMode: 'offline' | 'multiplayer' = 'offline';
  private roomCode = 'OFFLINE';
  private difficulty: BotDifficulty = 'veterano';
  private kills = 0;
  private deaths = 0;
  private headshots = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private damageDealt = 0;
  private score = 0;
  private matchElapsed = 0;
  private matchDuration = 180;
  private killTarget = 15;
  private matchFinished = false;
  private killFeed: KillFeedEvent[] = [];

  // Showcase avatar (Title / Shop)
  private showcaseRig: CharacterRig | null = null;
  private shopOrbitYaw = 0.35;
  private isDraggingShowcase = false;
  private lastDragX = 0;
  private lastDragY = 0;

  // Bots & Multiplayer Remote Players
  private bots: BotActor[] = [];
  private remotePlayers = new Map<string, RemoteActor>();
  private raycaster = new THREE.Raycaster();

  // Pooled tracers & sparks
  private tracerPool: TracerBeam[] = [];
  private sparkPool: SparkParticle[] = [];
  private tracerGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6);
  private sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);

  // Input state
  private heldKeys = new Set<string>();
  private mouseDown = false;
  private pointerLocked = false;
  private stepTimer = 0;
  private lastHudEmit = 0;
  private lastNetMoveEmit = 0;

  // Bound event listeners
  private onResizeBound: () => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: () => void;
  private onPointerLockChangeBound: () => void;
  private onBlurBound: () => void;

  constructor(
    container: HTMLElement,
    initialLoadout: AvatarLoadout,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.playerLoadout = initialLoadout;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x131b26);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0x131b26, 0.0115);

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(74, aspect, 0.08, 220);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Mandatory studio environment reflection
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 3-Point Warm/Cool Lighting Rig
    const hemi = new THREE.HemisphereLight(0x88b4e6, 0x3b3026, 0.72);
    this.scene.add(hemi);

    const sunKey = new THREE.DirectionalLight(0xfff1d6, 1.85);
    sunKey.position.set(28, 42, 22);
    sunKey.castShadow = !this.isSoftwareGl;
    sunKey.shadow.mapSize.width = 2048;
    sunKey.shadow.mapSize.height = 2048;
    sunKey.shadow.camera.left = -40;
    sunKey.shadow.camera.right = 40;
    sunKey.shadow.camera.top = 40;
    sunKey.shadow.camera.bottom = -40;
    sunKey.shadow.camera.near = 5;
    sunKey.shadow.camera.far = 110;
    sunKey.shadow.bias = -0.0005;
    sunKey.shadow.normalBias = 0.02;
    this.scene.add(sunKey);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-26, 18, -28);
    this.scene.add(rimLight);

    // Build Arena
    this.arena = buildTacticalArena(this.renderer);
    this.scene.add(this.arena.group);

    // Showcase Avatar on central platform
    this.rebuildShowcaseAvatar();
    this.rebuildFirstPersonWeapon();

    // Pre-allocate tracer & spark pools
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(this.tracerGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracerPool.push({ mesh, life: 0, maxLife: 0.08 });
    }
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparkPool.push({ mesh, vel: new THREE.Vector3(), life: 0 });
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind events
    this.onResizeBound = this.handleResize.bind(this);
    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onMouseMoveBound = this.handleMouseMove.bind(this);
    this.onMouseDownBound = this.handleMouseDown.bind(this);
    this.onMouseUpBound = this.handleMouseUp.bind(this);
    this.onPointerLockChangeBound = this.handlePointerLockChange.bind(this);
    this.onBlurBound = this.handleWindowBlur.bind(this);

    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    window.addEventListener('blur', this.onBlurBound);

    this.clock.start();
    this.tick();
  }

  public setIdentity(playerId: string, name: string, clanTag: string, loadout: AvatarLoadout, sensitivity: number) {
    this.playerId = playerId;
    this.playerName = name;
    this.playerClanTag = clanTag;
    this.sensitivity = sensitivity;
    const changed = JSON.stringify(this.playerLoadout) !== JSON.stringify(loadout);
    this.playerLoadout = loadout;
    if (changed) {
      this.rebuildShowcaseAvatar();
      this.rebuildFirstPersonWeapon();
    }
  }

  public setViewMode(mode: EngineViewMode) {
    this.viewMode = mode;
    if (mode !== 'playing') {
      this.exitPointerLock();
      this.clearBots();
      this.clearRemotePlayers();
      if (this.fpWeapon) this.fpWeapon.root.visible = false;
      if (this.showcaseRig) this.showcaseRig.root.visible = true;
    } else {
      if (this.showcaseRig) this.showcaseRig.root.visible = false;
      if (this.fpWeapon) this.fpWeapon.root.visible = true;
    }
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.heldKeys.clear();
      this.mouseDown = false;
      this.exitPointerLock();
    }
  }

  public setChatOpen(open: boolean) {
    this.chatOpen = open;
    if (open) {
      this.heldKeys.clear();
      this.mouseDown = false;
      this.exitPointerLock();
    }
  }

  public requestPointerLock() {
    if (this.viewMode === 'playing' && !this.paused && !this.chatOpen && !this.matchFinished) {
      try {
        this.renderer.domElement.requestPointerLock();
      } catch {
        // Fallback drag look remains available
      }
    }
  }

  public exitPointerLock() {
    if (document.pointerLockElement === this.renderer.domElement) {
      try {
        document.exitPointerLock();
      } catch {
        // ignore
      }
    }
  }

  public startOfflineMatch(difficulty: BotDifficulty) {
    this.matchMode = 'offline';
    this.roomCode = 'OFFLINE';
    this.difficulty = difficulty;
    this.resetMatchState();
    this.clearRemotePlayers();
    this.spawnBots(5);
    this.setViewMode('playing');
    this.requestPointerLock();
    this.emitHud(true);
  }

  public startMultiplayerMatch(roomCode: string, initialPlayers: RoomPlayerState[]) {
    this.matchMode = 'multiplayer';
    this.roomCode = roomCode;
    this.resetMatchState();
    this.clearBots();
    this.clearRemotePlayers();
    for (const p of initialPlayers) {
      if (p.id === this.playerId) {
        this.playerPos.set(p.x, p.y, p.z);
      } else {
        this.upsertRemotePlayer(p);
      }
    }
    this.setViewMode('playing');
    this.requestPointerLock();
    this.emitHud(true);
  }

  public upsertRemotePlayer(p: RoomPlayerState) {
    if (p.id === this.playerId) return;
    let actor = this.remotePlayers.get(p.id);
    if (!actor) {
      const rig = buildOperatorAvatar(p.loadout, p.id);
      rig.root.position.set(p.x, p.y, p.z);
      this.scene.add(rig.root);
      actor = {
        state: { ...p },
        rig,
        targetPos: new THREE.Vector3(p.x, p.y, p.z),
        targetYaw: p.yaw,
        hitFlashTimer: 0,
      };
      this.remotePlayers.set(p.id, actor);
    } else {
      actor.state = { ...actor.state, ...p };
      actor.targetPos.set(p.x, p.y, p.z);
      actor.targetYaw = p.yaw;
      actor.rig.root.visible = p.alive;
      actor.rig.speakingRing.visible = Boolean(p.isSpeaking && p.alive);
    }
  }

  public updateRemotePlayerTransform(playerId: string, x: number, y: number, z: number, yaw: number, pitch: number) {
    const actor = this.remotePlayers.get(playerId);
    if (!actor) return;
    actor.targetPos.set(x, y, z);
    actor.targetYaw = yaw;
    actor.state.pitch = pitch;
  }

  public setRemoteSpeaking(playerId: string, speaking: boolean) {
    const actor = this.remotePlayers.get(playerId);
    if (!actor) return;
    actor.state.isSpeaking = speaking;
    actor.rig.speakingRing.visible = speaking && actor.state.alive;
  }

  public removeRemotePlayer(playerId: string) {
    const actor = this.remotePlayers.get(playerId);
    if (!actor) return;
    this.scene.remove(actor.rig.root);
    actor.rig.dispose();
    this.remotePlayers.delete(playerId);
  }

  public handleRemoteFired(origin: [number, number, number], hitPoint: [number, number, number], tracerId: string) {
    const tracerSpec = getShopItem(tracerId || 'tracer_amber');
    this.spawnTracer(
      _vec3.set(origin[0], origin[1], origin[2]),
      _vec3b.set(hitPoint[0], hitPoint[1], hitPoint[2]),
      tracerSpec.primaryColor,
    );
    soundEngine.playShoot(true);
  }

  public handleRemoteDamaged(targetId: string, hp: number, headshot: boolean) {
    if (targetId === this.playerId) {
      this.hp = hp;
      this.damageFlash = 0.85;
      this.cameraShake = Math.max(this.cameraShake, 0.08);
      soundEngine.playDamage();
      if (hp <= 0) {
        this.alive = false;
        this.respawnTimer = 3.0;
        this.deaths += 1;
      }
      this.emitHud(true);
    } else {
      const actor = this.remotePlayers.get(targetId);
      if (actor) {
        actor.state.hp = hp;
        actor.hitFlashTimer = 0.14;
        if (headshot) actor.hitFlashTimer = 0.2;
      }
    }
  }

  public handleRemoteKilled(
    killerId: string,
    killerName: string,
    victimId: string,
    victimName: string,
    headshot: boolean,
  ) {
    if (killerId === this.playerId) {
      this.kills += 1;
      if (headshot) this.headshots += 1;
      this.score += headshot ? 150 : 100;
      this.hitstopTimer = 0.045;
      soundEngine.playKillConfirm();
    }
    const victim = this.remotePlayers.get(victimId);
    if (victim) {
      victim.state.alive = false;
      victim.state.deaths += 1;
      victim.rig.root.visible = false;
    }
    const killer = this.remotePlayers.get(killerId);
    if (killer) {
      killer.state.kills += 1;
      killer.state.score += headshot ? 150 : 100;
    }
    this.pushKillFeed(killerName, victimName, headshot);
    this.emitHud(true);
  }

  public handleRemoteRespawned(playerId: string, x: number, y: number, z: number) {
    if (playerId === this.playerId) {
      this.playerPos.set(x, y, z);
      this.hp = 100;
      this.alive = true;
      this.ammo = this.maxAmmo;
      this.emitHud(true);
    } else {
      const actor = this.remotePlayers.get(playerId);
      if (actor) {
        actor.state.alive = true;
        actor.state.hp = 100;
        actor.targetPos.set(x, y, z);
        actor.rig.root.position.set(x, y, z);
        actor.rig.root.visible = true;
      }
    }
  }

  public handleRemoteMatchEnded() {
    if (this.matchFinished) return;
    this.finishMatch();
  }

  private resetMatchState() {
    const spawn = this.arena.spawnPoints[0];
    this.playerPos.copy(spawn);
    this.playerVel.set(0, 0, 0);
    this.yaw = Math.atan2(-spawn.x, -spawn.z);
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.respawnTimer = 0;
    this.stamina = 100;
    this.ammo = 30;
    this.reserveAmmo = 150;
    this.reloading = false;
    this.reloadTimer = 0;
    this.kills = 0;
    this.deaths = 0;
    this.headshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageDealt = 0;
    this.score = 0;
    this.matchElapsed = 0;
    this.matchFinished = false;
    this.paused = false;
    this.chatOpen = false;
    this.killFeed = [];
  }

  private rebuildShowcaseAvatar() {
    if (this.showcaseRig) {
      this.scene.remove(this.showcaseRig.root);
      this.showcaseRig.dispose();
    }
    this.showcaseRig = buildOperatorAvatar(this.playerLoadout, 'showcase');
    this.showcaseRig.root.position.set(0, 2.0, 0);
    this.showcaseRig.root.visible = this.viewMode !== 'playing';
    this.scene.add(this.showcaseRig.root);
  }

  private rebuildFirstPersonWeapon() {
    if (this.fpWeapon) {
      this.camera.remove(this.fpWeapon.root);
      this.fpWeapon.dispose();
    }
    this.fpWeapon = buildFirstPersonWeapon(this.playerLoadout);
    this.fpWeapon.root.position.set(0.24, -0.22, -0.36);
    this.fpWeapon.root.visible = this.viewMode === 'playing';
    this.camera.add(this.fpWeapon.root);
  }

  private spawnBots(count: number) {
    this.clearBots();
    for (let i = 0; i < count; i++) {
      const profile = BOT_PROFILES[i % BOT_PROFILES.length];
      const id = `bot_${i}`;
      const rig = buildOperatorAvatar(profile.loadout, id);
      const spawn = this.arena.spawnPoints[(i + 1) % this.arena.spawnPoints.length];
      rig.root.position.copy(spawn);
      this.scene.add(rig.root);

      const laserGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, 1),
      ]);
      const laserMat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.75 });
      const laserLine = new THREE.Line(laserGeo, laserMat);
      laserLine.visible = false;
      this.scene.add(laserLine);

      this.bots.push({
        id,
        name: profile.name,
        clanTag: profile.clanTag,
        rig,
        pos: spawn.clone(),
        vel: new THREE.Vector3(),
        yaw: Math.random() * Math.PI * 2,
        hp: 100,
        alive: true,
        respawnTimer: 0,
        kills: 0,
        deaths: 0,
        score: 0,
        patrolTarget: this.arena.patrolPoints[i % this.arena.patrolPoints.length].clone(),
        fireCooldown: 0.8 + Math.random() * 0.8,
        windupTimer: 0,
        hitFlashTimer: 0,
        strafeDir: i % 2 === 0 ? 1 : -1,
        strafeTimer: 1.5,
        laserLine,
      });
    }
  }

  private clearBots() {
    for (const bot of this.bots) {
      this.scene.remove(bot.rig.root);
      this.scene.remove(bot.laserLine);
      bot.laserLine.geometry.dispose();
      (bot.laserLine.material as THREE.Material).dispose();
      bot.rig.dispose();
    }
    this.bots = [];
  }

  private clearRemotePlayers() {
    for (const actor of this.remotePlayers.values()) {
      this.scene.remove(actor.rig.root);
      actor.rig.dispose();
    }
    this.remotePlayers.clear();
  }

  private handleResize() {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private handleWindowBlur() {
    this.heldKeys.clear();
    this.mouseDown = false;
    this.isDraggingShowcase = false;
  }

  private handlePointerLockChange() {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud(true);
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.viewMode !== 'playing') return;

    if (e.code === 'Escape') {
      if (this.chatOpen) {
        this.callbacks.onToggleChat();
        return;
      }
      this.callbacks.onPauseToggle();
      return;
    }

    if (this.chatOpen) return;

    if (e.code === 'KeyT' || e.code === 'Enter') {
      e.preventDefault();
      this.callbacks.onToggleChat();
      return;
    }

    if (e.code === 'KeyV') {
      this.callbacks.onToggleMic();
      return;
    }

    if (e.code === 'Tab') {
      e.preventDefault();
      this.callbacks.onToggleScoreboard(true);
      return;
    }

    if (e.code === 'KeyR' && !this.paused && this.alive) {
      this.startReload();
    }

    if (e.code === 'Space' && !this.paused && this.alive && this.onGround) {
      this.playerVel.y = 7.4;
      this.onGround = false;
      soundEngine.playFootstep();
    }

    this.heldKeys.add(e.code);
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.heldKeys.delete(e.code);
    if (e.code === 'Tab') {
      this.callbacks.onToggleScoreboard(false);
    }
  }

  private handleMouseDown(e: MouseEvent) {
    if (this.viewMode === 'shop') {
      this.isDraggingShowcase = true;
      this.lastDragX = e.clientX;
      return;
    }
    if (this.viewMode !== 'playing' || this.paused || this.chatOpen || this.matchFinished) return;

    if (!this.pointerLocked) {
      this.requestPointerLock();
      this.isDraggingShowcase = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
    }
    if (e.button === 0) {
      this.mouseDown = true;
    }
  }

  private handleMouseUp() {
    this.mouseDown = false;
    this.isDraggingShowcase = false;
  }

  private handleMouseMove(e: MouseEvent) {
    if (this.viewMode === 'shop' && this.isDraggingShowcase) {
      const dx = e.clientX - this.lastDragX;
      this.lastDragX = e.clientX;
      this.shopOrbitYaw += dx * 0.01;
      return;
    }
    if (this.viewMode !== 'playing' || this.paused || this.chatOpen || this.matchFinished) return;

    if (this.pointerLocked) {
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * this.sensitivity,
        -Math.PI / 2.2,
        Math.PI / 2.2,
      );
    } else if (this.isDraggingShowcase) {
      const dx = e.clientX - this.lastDragX;
      const dy = e.clientY - this.lastDragY;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      this.yaw -= dx * this.sensitivity * 1.4;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - dy * this.sensitivity * 1.4,
        -Math.PI / 2.2,
        Math.PI / 2.2,
      );
    }
  }

  private startReload() {
    if (this.reloading || this.ammo >= this.maxAmmo || this.reserveAmmo <= 0) return;
    this.reloading = true;
    this.reloadTimer = 0;
    soundEngine.playReload();
  }

  private tryShoot() {
    if (!this.alive || this.reloading || this.fireCooldown > 0) return;
    if (this.ammo <= 0) {
      this.fireCooldown = 0.25;
      soundEngine.playEmptyClick();
      if (this.reserveAmmo > 0) this.startReload();
      return;
    }

    this.ammo -= 1;
    this.shotsFired += 1;
    this.fireCooldown = 0.11;
    this.weaponKick = 0.085;
    this.recoilPitch += 0.015;
    this.muzzleFlashTimer = 0.045;
    this.cameraShake = Math.max(this.cameraShake, 0.024);
    soundEngine.playShoot(false);

    if (this.ammo === 0 && this.reserveAmmo > 0) {
      this.startReload();
    }

    // Raycast from center screen
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 140;

    // Collect shootable meshes: arena obstacles + bots or remote players
    const targets: THREE.Object3D[] = [...this.arena.raycastMeshes];
    for (const bot of this.bots) {
      if (bot.alive) targets.push(bot.rig.root);
    }
    for (const actor of this.remotePlayers.values()) {
      if (actor.state.alive) targets.push(actor.rig.root);
    }

    const hits = this.raycaster.intersectObjects(targets, true);
    const origin = _vec3.copy(this.camera.position);
    origin.y -= 0.06;

    let hitPoint = _vec3b.copy(this.camera.position).addScaledVector(this.raycaster.ray.direction, 65);
    let hitEntityId: string | null = null;
    let isHeadshot = false;

    if (hits.length > 0) {
      hitPoint.copy(hits[0].point);
      const entityId = hits[0].object.userData.entityId as string | undefined;
      if (entityId) {
        hitEntityId = entityId;
        isHeadshot = Boolean(hits[0].object.userData.isHead);
      }
      this.spawnSparks(hitPoint, hitEntityId ? '#ef4444' : '#fbbf24', hitEntityId ? 6 : 4);
    }

    const tracerSpec = getShopItem(this.playerLoadout.tracer);
    this.spawnTracer(origin, hitPoint, tracerSpec.primaryColor);

    if (this.matchMode === 'multiplayer') {
      this.callbacks.onMultiplayerShoot?.(
        [origin.x, origin.y, origin.z],
        [hitPoint.x, hitPoint.y, hitPoint.z],
      );
    }

    if (hitEntityId) {
      this.shotsHit += 1;
      this.hitmarkerState = isHeadshot ? 'head' : 'body';
      this.hitmarkerTimer = 0.16;
      soundEngine.playHitmarker(isHeadshot);

      if (this.matchMode === 'offline') {
        const bot = this.bots.find((b) => b.id === hitEntityId);
        if (bot && bot.alive) {
          const dmg = isHeadshot ? 68 : 34;
          bot.hp = Math.max(0, bot.hp - dmg);
          this.damageDealt += dmg;
          bot.hitFlashTimer = 0.12;
          if (bot.hp <= 0) {
            bot.alive = false;
            bot.deaths += 1;
            bot.respawnTimer = 3.0;
            bot.rig.root.visible = false;
            bot.laserLine.visible = false;
            this.kills += 1;
            if (isHeadshot) this.headshots += 1;
            this.score += isHeadshot ? 150 : 100;
            this.hitstopTimer = 0.045;
            soundEngine.playKillConfirm();
            this.pushKillFeed(this.playerName, bot.name, isHeadshot);
            if (this.kills >= this.killTarget) {
              this.finishMatch();
            }
          }
        }
      } else {
        this.damageDealt += isHeadshot ? 68 : 34;
        this.callbacks.onMultiplayerHit?.(hitEntityId, isHeadshot);
      }
    }
  }

  private pushKillFeed(killerName: string, victimName: string, headshot: boolean) {
    this.killFeed = [
      {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        killerName,
        victimName,
        headshot,
        timestamp: Date.now(),
      },
      ...this.killFeed.slice(0, 3),
    ];
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex: string) {
    const slot = this.tracerPool.find((t) => t.life <= 0) || this.tracerPool[0];
    const dist = start.distanceTo(end);
    if (dist < 0.2) return;

    slot.mesh.visible = true;
    slot.life = slot.maxLife;
    (slot.mesh.material as THREE.MeshBasicMaterial).color.set(colorHex);
    (slot.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
    slot.mesh.scale.set(1, dist, 1);
    slot.mesh.position.copy(start).lerp(end, 0.5);
    _dir.subVectors(end, start).normalize();
    _quat.setFromUnitVectors(_up, _dir);
    slot.mesh.quaternion.copy(_quat);
  }

  private spawnSparks(pos: THREE.Vector3, colorHex: string, count: number) {
    let spawned = 0;
    for (const s of this.sparkPool) {
      if (s.life <= 0) {
        s.mesh.visible = true;
        s.mesh.position.copy(pos);
        (s.mesh.material as THREE.MeshBasicMaterial).color.set(colorHex);
        s.vel.set((Math.random() - 0.5) * 7, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 7);
        s.life = 0.28;
        spawned += 1;
        if (spawned >= count) break;
      }
    }
  }

  private updateEffects(dt: number) {
    for (const t of this.tracerPool) {
      if (t.life > 0) {
        t.life -= dt;
        (t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t.life / t.maxLife);
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const s of this.sparkPool) {
      if (s.life > 0) {
        s.life -= dt;
        s.vel.y -= 14 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
  }

  private updatePlayer(dt: number) {
    if (this.paused || this.matchFinished) return;

    this.matchElapsed += dt;
    if (this.matchMode === 'offline' && this.matchElapsed >= this.matchDuration) {
      this.finishMatch();
      return;
    }

    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.matchMode === 'offline' && this.respawnTimer <= 0) {
        const spawn = this.arena.spawnPoints[Math.floor(Math.random() * this.arena.spawnPoints.length)];
        this.playerPos.copy(spawn);
        this.playerVel.set(0, 0, 0);
        this.hp = 100;
        this.alive = true;
        this.ammo = this.maxAmmo;
        this.reloading = false;
      }
      return;
    }

    // Reload progress
    if (this.reloading) {
      this.reloadTimer += dt;
      if (this.reloadTimer >= this.reloadDuration) {
        const needed = this.maxAmmo - this.ammo;
        const load = Math.min(needed, this.reserveAmmo);
        this.ammo += load;
        this.reserveAmmo -= load;
        this.reloading = false;
        this.reloadTimer = 0;
      }
    }

    // Cooldowns & recoil decay
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 14, dt);
    this.weaponKick = THREE.MathUtils.damp(this.weaponKick, 0, 16, dt);
    this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 18, dt);
    this.damageFlash = THREE.MathUtils.damp(this.damageFlash, 0, 8, dt);
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.hitmarkerState = 'none';
    }

    if (this.mouseDown && !this.chatOpen) {
      this.tryShoot();
    }

    // Movement
    let moveF = 0;
    let moveR = 0;
    if (!this.chatOpen) {
      if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) moveF += 1;
      if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) moveF -= 1;
      if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) moveR -= 1;
      if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) moveR += 1;
    }

    const sprinting = this.heldKeys.has('ShiftLeft') && moveF > 0 && this.stamina > 5;
    if (sprinting && (moveF !== 0 || moveR !== 0)) {
      this.stamina = Math.max(0, this.stamina - 28 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 20 * dt);
    }

    const speed = sprinting ? 9.6 : 6.4;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    // Forward vector is (-sin(yaw), 0, -cos(yaw)); Right is (cos(yaw), 0, -sin(yaw))
    const wishX = -sinY * moveF + cosY * moveR;
    const wishZ = -cosY * moveF - sinY * moveR;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.001) {
      this.playerVel.x = (wishX / wishLen) * speed;
      this.playerVel.z = (wishZ / wishLen) * speed;
      if (this.onGround) {
        this.stepTimer -= dt * (sprinting ? 1.5 : 1.0);
        if (this.stepTimer <= 0) {
          this.stepTimer = 0.36;
          soundEngine.playFootstep();
        }
      }
    } else {
      this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, 0, 14, dt);
      this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, 0, 14, dt);
    }

    // Gravity & Ground
    this.playerVel.y -= 20 * dt;
    this.playerPos.x += this.playerVel.x * dt;
    this.playerPos.z += this.playerVel.z * dt;
    this.playerPos.y += this.playerVel.y * dt;

    resolveObstacleCollision(this.arena, this.playerPos, 0.52, this.playerPos.y);

    const floorY = getGroundHeightAt(this.arena, this.playerPos.x, this.playerPos.z, this.playerPos.y);
    if (this.playerPos.y <= floorY) {
      this.playerPos.y = floorY;
      this.playerVel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Camera position + subtle head bob + shake
    const moving = wishLen > 0.1 && this.onGround;
    const bob = moving ? Math.sin(this.matchElapsed * (sprinting ? 14 : 9.5)) * 0.035 : 0;
    const shakeX = (Math.random() - 0.5) * this.cameraShake;
    const shakeY = (Math.random() - 0.5) * this.cameraShake;

    this.camera.position.set(
      this.playerPos.x + shakeX,
      this.playerPos.y + 1.62 + bob + shakeY,
      this.playerPos.z,
    );
    _euler.set(this.pitch + this.recoilPitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    // First-person weapon recoil & reload animation
    if (this.fpWeapon) {
      const reloadTilt = this.reloading ? Math.sin((this.reloadTimer / this.reloadDuration) * Math.PI) * 0.45 : 0;
      this.fpWeapon.root.position.set(
        0.24,
        -0.22 - reloadTilt * 0.18 + (moving ? Math.cos(this.matchElapsed * 9.5) * 0.008 : 0),
        -0.36 + this.weaponKick,
      );
      this.fpWeapon.root.rotation.set(this.weaponKick * 1.4 - reloadTilt, 0, reloadTilt * 0.4);

      if (this.muzzleFlashTimer > 0) {
        this.muzzleFlashTimer -= dt;
        this.fpWeapon.muzzleFlash.visible = true;
        this.fpWeapon.muzzleFlash.rotation.z = Math.random() * Math.PI;
        this.fpWeapon.muzzleLight.intensity = 2.8;
      } else {
        this.fpWeapon.muzzleFlash.visible = false;
        this.fpWeapon.muzzleLight.intensity = 0;
      }
    }

    // Network position broadcast (~20Hz)
    if (this.matchMode === 'multiplayer' && performance.now() - this.lastNetMoveEmit > 50) {
      this.lastNetMoveEmit = performance.now();
      this.callbacks.onMultiplayerMove?.(
        this.playerPos.x,
        this.playerPos.y,
        this.playerPos.z,
        this.yaw,
        this.pitch,
      );
    }
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    _dir.subVectors(to, from);
    const dist = _dir.length();
    if (dist < 0.5) return true;
    _dir.divideScalar(dist);
    this.raycaster.set(from, _dir);
    this.raycaster.far = dist;
    const hits = this.raycaster.intersectObjects(this.arena.raycastMeshes, false);
    return hits.length === 0;
  }

  private updateBots(dt: number) {
    if (this.matchMode !== 'offline' || this.paused || this.matchFinished) return;

    const accuracyMap: Record<BotDifficulty, number> = { recluta: 0.25, veterano: 0.45, elite: 0.68 };
    const speedMap: Record<BotDifficulty, number> = { recluta: 3.6, veterano: 4.8, elite: 5.8 };
    const botSpeed = speedMap[this.difficulty];
    const botAccuracy = accuracyMap[this.difficulty];

    for (const bot of this.bots) {
      // Hit flash decay
      if (bot.hitFlashTimer > 0) {
        bot.hitFlashTimer -= dt;
        for (const m of bot.rig.hitMaterials) {
          m.emissive.setHex(bot.hitFlashTimer > 0 ? 0xffffff : 0x000000);
          m.emissiveIntensity = bot.hitFlashTimer > 0 ? 0.6 : 0;
        }
      }

      if (!bot.alive) {
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) {
          const spawn = this.arena.spawnPoints[Math.floor(Math.random() * this.arena.spawnPoints.length)];
          bot.pos.copy(spawn);
          bot.hp = 100;
          bot.alive = true;
          bot.windupTimer = 0;
          bot.rig.root.visible = true;
        }
        continue;
      }

      const distToPlayer = bot.pos.distanceTo(this.playerPos);
      const eyeFrom = _vec3.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
      const eyeTo = _vec3b.set(this.playerPos.x, this.playerPos.y + 1.5, this.playerPos.z);
      const canSeePlayer = this.alive && distToPlayer < 42 && this.hasLineOfSight(eyeFrom, eyeTo);

      if (canSeePlayer) {
        const targetYaw = Math.atan2(this.playerPos.x - bot.pos.x, this.playerPos.z - bot.pos.z);
        bot.yaw = targetYaw;

        // Strafe & engage
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 1.2 + Math.random() * 1.4;
          bot.strafeDir *= -1;
        }

        const forwardMove = distToPlayer > 14 ? 0.85 : distToPlayer < 7 ? -0.6 : 0;
        const moveX = Math.sin(bot.yaw) * forwardMove + Math.cos(bot.yaw) * bot.strafeDir * 0.7;
        const moveZ = Math.cos(bot.yaw) * forwardMove - Math.sin(bot.yaw) * bot.strafeDir * 0.7;
        const mLen = Math.hypot(moveX, moveZ) || 1;
        bot.pos.x += (moveX / mLen) * botSpeed * dt;
        bot.pos.z += (moveZ / mLen) * botSpeed * dt;

        // Telegraph & shoot
        bot.fireCooldown -= dt;
        if (bot.fireCooldown <= 0) {
          if (bot.windupTimer <= 0) {
            bot.windupTimer = this.difficulty === 'recluta' ? 0.5 : 0.32;
          } else {
            bot.windupTimer -= dt;
            // Visible laser windup telegraph
            bot.laserLine.visible = true;
            const posAttr = bot.laserLine.geometry.attributes.position as THREE.BufferAttribute;
            posAttr.setXYZ(0, bot.pos.x, bot.pos.y + 1.35, bot.pos.z);
            posAttr.setXYZ(1, this.playerPos.x, this.playerPos.y + 1.4, this.playerPos.z);
            posAttr.needsUpdate = true;

            if (bot.windupTimer <= 0) {
              bot.laserLine.visible = false;
              bot.fireCooldown = this.difficulty === 'recluta' ? 1.15 : this.difficulty === 'veterano' ? 0.78 : 0.52;
              soundEngine.playShoot(true);

              const hitRoll = Math.random();
              const hitsPlayer = hitRoll < botAccuracy;
              const muzzlePos = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.35, bot.pos.z);
              const shotEnd = hitsPlayer
                ? new THREE.Vector3(this.playerPos.x, this.playerPos.y + 1.45, this.playerPos.z)
                : new THREE.Vector3(
                    this.playerPos.x + (Math.random() - 0.5) * 3,
                    this.playerPos.y + 1.2 + (Math.random() - 0.5) * 1.5,
                    this.playerPos.z + (Math.random() - 0.5) * 3,
                  );
              this.spawnTracer(muzzlePos, shotEnd, '#ef4444');

              if (hitsPlayer && this.alive) {
                const dmg = this.difficulty === 'recluta' ? 10 : this.difficulty === 'veterano' ? 15 : 20;
                this.hp = Math.max(0, this.hp - dmg);
                this.damageFlash = 0.85;
                this.cameraShake = Math.max(this.cameraShake, 0.085);
                soundEngine.playDamage();
                if (this.hp <= 0) {
                  this.alive = false;
                  this.deaths += 1;
                  this.respawnTimer = 3.0;
                  bot.kills += 1;
                  bot.score += 100;
                  this.pushKillFeed(bot.name, this.playerName, false);
                }
              }
            }
          }
        }
      } else {
        bot.laserLine.visible = false;
        bot.windupTimer = 0;

        // Patrol toward waypoint
        const toPatrolX = bot.patrolTarget.x - bot.pos.x;
        const toPatrolZ = bot.patrolTarget.z - bot.pos.z;
        const dist = Math.hypot(toPatrolX, toPatrolZ);
        if (dist < 2.2) {
          bot.patrolTarget.copy(
            this.arena.patrolPoints[Math.floor(Math.random() * this.arena.patrolPoints.length)],
          );
        } else {
          bot.yaw = Math.atan2(toPatrolX, toPatrolZ);
          bot.pos.x += (toPatrolX / dist) * botSpeed * 0.8 * dt;
          bot.pos.z += (toPatrolZ / dist) * botSpeed * 0.8 * dt;
        }
      }

      resolveObstacleCollision(this.arena, bot.pos, 0.52, bot.pos.y);
      const groundY = getGroundHeightAt(this.arena, bot.pos.x, bot.pos.z, bot.pos.y);
      bot.pos.y = THREE.MathUtils.damp(bot.pos.y, groundY, 12, dt);

      bot.rig.root.position.copy(bot.pos);
      bot.rig.root.rotation.y = bot.yaw;

      // Procedural leg swing
      const swing = Math.sin(this.matchElapsed * 9 + Number(bot.id.slice(-1))) * 0.45;
      bot.rig.leftLeg.rotation.x = swing;
      bot.rig.rightLeg.rotation.x = -swing;
    }
  }

  private updateRemoteActors(dt: number) {
    for (const actor of this.remotePlayers.values()) {
      if (!actor.state.alive) continue;
      const prevX = actor.rig.root.position.x;
      const prevZ = actor.rig.root.position.z;
      actor.rig.root.position.lerp(actor.targetPos, 1 - Math.exp(-14 * dt));
      // Three.js character faces +Z while FPS yaw looks along -Z
      actor.rig.root.rotation.y = actor.targetYaw + Math.PI;

      const moved = Math.hypot(actor.rig.root.position.x - prevX, actor.rig.root.position.z - prevZ);
      const swing = moved > 0.005 ? Math.sin(performance.now() * 0.012) * 0.5 : 0;
      actor.rig.leftLeg.rotation.x = THREE.MathUtils.damp(actor.rig.leftLeg.rotation.x, swing, 12, dt);
      actor.rig.rightLeg.rotation.x = THREE.MathUtils.damp(actor.rig.rightLeg.rotation.x, -swing, 12, dt);

      if (actor.hitFlashTimer > 0) {
        actor.hitFlashTimer -= dt;
        for (const m of actor.rig.hitMaterials) {
          m.emissive.setHex(actor.hitFlashTimer > 0 ? 0xffffff : 0x000000);
          m.emissiveIntensity = actor.hitFlashTimer > 0 ? 0.55 : 0;
        }
      }
    }
  }

  private finishMatch() {
    this.matchFinished = true;
    this.exitPointerLock();
    const scoreboard = this.buildScoreboard();
    const selfIndex = scoreboard.findIndex((s) => s.isSelf);
    const placement = selfIndex >= 0 ? selfIndex + 1 : 1;
    const won = placement === 1 && this.kills > 0;

    const coinsEarned = 80 + this.kills * 25 + (won ? 120 : 25) + (this.matchMode === 'multiplayer' ? 60 : 0);
    const xpEarned = 60 + this.kills * 30 + (won ? 150 : 40);

    const summary: MatchSummary = {
      mode: this.matchMode,
      roomCode: this.roomCode,
      won,
      placement,
      totalPlayers: scoreboard.length,
      kills: this.kills,
      deaths: this.deaths,
      headshots: this.headshots,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      damageDealt: this.damageDealt,
      durationSec: Math.round(this.matchElapsed),
      coinsEarned,
      xpEarned,
      clanPointsEarned: this.playerClanTag ? this.kills * 15 + (won ? 100 : 25) : 0,
      unlockedAchievements: [],
      scoreboard: scoreboard.map((s) => ({
        name: s.name,
        clanTag: s.clanTag,
        kills: s.kills,
        deaths: s.deaths,
        score: s.score,
        isSelf: s.isSelf,
        isBot: s.isBot,
      })),
    };

    this.callbacks.onMatchEnd(summary);
  }

  private buildScoreboard() {
    const entries: HudSnapshot['scoreboard'] = [
      {
        id: this.playerId,
        name: this.playerName,
        clanTag: this.playerClanTag,
        kills: this.kills,
        deaths: this.deaths,
        score: this.score,
        isSelf: true,
        isBot: false,
      },
    ];

    if (this.matchMode === 'offline') {
      for (const b of this.bots) {
        entries.push({
          id: b.id,
          name: b.name,
          clanTag: b.clanTag,
          kills: b.kills,
          deaths: b.deaths,
          score: b.score,
          isSelf: false,
          isBot: true,
        });
      }
    } else {
      for (const r of this.remotePlayers.values()) {
        entries.push({
          id: r.state.id,
          name: r.state.name,
          clanTag: r.state.clanTag,
          kills: r.state.kills,
          deaths: r.state.deaths,
          score: r.state.score,
          isSelf: false,
          isBot: false,
          isSpeaking: r.state.isSpeaking,
        });
      }
    }

    return entries.sort((a, b) => b.kills - a.kills || b.score - a.score);
  }

  private emitHud(force = false) {
    const now = performance.now();
    if (!force && now - this.lastHudEmit < 55) return;
    this.lastHudEmit = now;

    this.callbacks.onHudUpdate({
      hp: this.hp,
      ammo: this.ammo,
      maxAmmo: this.maxAmmo,
      reserveAmmo: this.reserveAmmo,
      reloading: this.reloading,
      reloadProgress: this.reloading ? Math.min(1, this.reloadTimer / this.reloadDuration) : 0,
      stamina: Math.round(this.stamina),
      kills: this.kills,
      deaths: this.deaths,
      headshots: this.headshots,
      score: this.score,
      timeRemaining: Math.max(0, Math.ceil(this.matchDuration - this.matchElapsed)),
      killTarget: this.killTarget,
      hitmarker: this.hitmarkerState,
      damageFlash: this.damageFlash,
      crosshairSpread: Math.min(18, this.weaponKick * 140 + (this.playerVel.length() > 1 ? 4 : 0)),
      pointerLocked: this.pointerLocked,
      alive: this.alive,
      respawnIn: Math.max(0, Math.ceil(this.respawnTimer)),
      killFeed: this.killFeed,
      scoreboard: this.buildScoreboard(),
    });
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const elapsed = this.clock.elapsedTime;

    if (this.viewMode === 'title') {
      // Atmospheric orbital camera pan over the live tactical arena
      const angle = elapsed * 0.14;
      const targetX = Math.cos(angle) * 21;
      const targetZ = Math.sin(angle) * 21;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetX, 3, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 9.5, 3, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetZ, 3, dt);
      this.camera.lookAt(0, 2.8, 0);
      if (this.showcaseRig) {
        this.showcaseRig.root.rotation.y = Math.sin(elapsed * 0.5) * 0.35;
      }
    } else if (this.viewMode === 'shop') {
      // Showcase camera smoothly framing the customized 3D operator on the bridge
      if (!this.isDraggingShowcase) {
        this.shopOrbitYaw += dt * 0.38;
      }
      const camX = Math.sin(this.shopOrbitYaw) * 3.1;
      const camZ = Math.cos(this.shopOrbitYaw) * 3.1;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camX, 6, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 3.25, 6, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, camZ, 6, dt);
      this.camera.lookAt(0, 3.0, 0);
      if (this.showcaseRig) {
        this.showcaseRig.root.rotation.y = 0;
      }
    } else if (this.viewMode === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.updatePlayer(dt);
        this.updateBots(dt);
        this.updateRemoteActors(dt);
        this.updateEffects(dt);
      }
      this.emitHud(false);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.exitPointerLock();

    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDownBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    window.removeEventListener('blur', this.onBlurBound);

    this.clearBots();
    this.clearRemotePlayers();
    this.showcaseRig?.dispose();
    this.fpWeapon?.dispose();
    this.arena.dispose();
    this.tracerGeo.dispose();
    this.sparkGeo.dispose();
    this.tracerPool.forEach((t) => (t.mesh.material as THREE.Material).dispose());
    this.sparkPool.forEach((s) => (s.mesh.material as THREE.Material).dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
