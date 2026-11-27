import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { soundEngine } from '../audio/soundEngine';
import { getShopItem } from '../data/catalog';
import type { AvatarLoadout, KillFeedEvent, MatchSummary, RoomPlayerState } from '../types/game';
import { buildTacticalArena, getGroundHeightAt, resolveObstacleCollision, type ArenaData } from './ArenaBuilder';
import { buildFirstPersonWeapon, buildOperatorAvatar, type CharacterRig, type FirstPersonWeaponRig } from './AvatarBuilder';

export type EngineViewMode = 'title' | 'lobby' | 'shop' | 'playing';
export type BotDifficulty = 'recluta' | 'veterano' | 'elite';

export interface HudSnapshot {
  hp: number;
  ammo: number;
  maxAmmo: number;
  reserveAmmo: number;
  grenades: number;
  maxGrenades: number;
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
  lowHealthIntensity: number;
  grenadeShockIntensity: number;
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
  grenadeCooldown: number;
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

interface ActiveGrenade {
  group: THREE.Group;
  ledMat: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  ownerId: string;
  ownerName: string;
  isLocalOwner: boolean;
}

interface ExplosionWave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
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

interface FireFlameParticle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  baseScale: number;
  swirlPhase: number;
}

interface FireRingEffect {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface FireFlashLight {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
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
  onMultiplayerGrenadeThrow?: (origin: [number, number, number], velocity: [number, number, number]) => void;
  onMultiplayerGrenadeDamage?: (targetId: string, damage: number) => void;
}

const CombatPostProcessShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    lowHealth: { value: 0 },
    grenadeShock: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float lowHealth;
    uniform float grenadeShock;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float dist = length(centered);

      // Frag grenade shockwave ripple + concussion chromatic aberration
      if (grenadeShock > 0.005) {
        float wave = sin(dist * 28.0 - time * 20.0) * 0.016 * grenadeShock;
        vec2 dir = dist > 0.0001 ? centered / dist : vec2(0.0);
        uv += dir * wave;
        uv.x += sin(uv.y * 42.0 + time * 30.0) * 0.007 * grenadeShock;
      }

      float chroma = grenadeShock * 0.014;
      vec4 baseSample = texture2D(tDiffuse, clamp(uv, 0.001, 0.999));
      float r = texture2D(tDiffuse, clamp(uv + centered * chroma, 0.001, 0.999)).r;
      float b = texture2D(tDiffuse, clamp(uv - centered * chroma, 0.001, 0.999)).b;
      vec3 color = mix(baseSample.rgb, vec3(r, baseSample.g, b), step(0.001, grenadeShock));

      // Low-health crimson vignette with gentle tactical pulse
      if (lowHealth > 0.01) {
        float pulse = 0.85 + 0.15 * sin(time * 5.2);
        float vig = smoothstep(0.28, 0.82, dist) * lowHealth * pulse;
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(color, vec3(luma), vig * 0.35);
        color = mix(color, vec3(0.55, 0.03, 0.04), vig * 0.65);
      }

      // Concussion white/amber flash edge during grenade blast
      if (grenadeShock > 0.01) {
        float flash = grenadeShock * 0.22 * (1.0 - smoothstep(0.0, 0.8, dist));
        color += vec3(1.0, 0.72, 0.45) * flash;
      }

      gl_FragColor = vec4(color, baseSample.a);
    }
  `,
};

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
    loadout: { helmet: 'helmet_amber_recon', armor: 'armor_obsidian', pants: 'pants_classic_cargo', backpack: 'pack_comms_antenna', weaponSkin: 'skin_graphite', tracer: 'tracer_amber' },
  },
  {
    name: 'Centinela-02',
    clanTag: 'BOT',
    loadout: { helmet: 'helmet_crimson_spec', armor: 'armor_cobalt_vanguard', pants: 'pants_camo_tactical', backpack: 'pack_thruster', weaponSkin: 'skin_crimson_alloy', tracer: 'tracer_crimson' },
  },
  {
    name: 'Lobo-03',
    clanTag: 'BOT',
    loadout: { helmet: 'head_classic_cap', armor: 'top_leather_jacket', pants: 'pants_blue_jeans', backpack: 'pack_standard', weaponSkin: 'skin_desert_sand', tracer: 'tracer_cyan' },
  },
  {
    name: 'Titán-04',
    clanTag: 'BOT',
    loadout: { helmet: 'helmet_titan_gold', armor: 'armor_apex_gold', pants: 'pants_white_elite', backpack: 'pack_thruster', weaponSkin: 'skin_gold_prestige', tracer: 'tracer_emerald' },
  },
  {
    name: 'Espectro-05',
    clanTag: 'BOT',
    loadout: { helmet: 'head_red_beret', armor: 'top_red_hoodie', pants: 'pants_sport_joggers', backpack: 'pack_comms_antenna', weaponSkin: 'skin_graphite', tracer: 'tracer_amber' },
  },
];

export class BattlePlayersEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private combatPass: ShaderPass | null = null;
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
  private isTouchDevice = false;

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

  // Weapon & Grenade state
  private fpWeapon: FirstPersonWeaponRig | null = null;
  private ammo = 30;
  private maxAmmo = 30;
  private reserveAmmo = 150;
  private grenades = 2;
  private maxGrenades = 2;
  private grenadeThrowCooldown = 0;
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
  private lowHealthIntensity = 0;
  private grenadeShockIntensity = 0;

  // Match stats
  private matchMode: 'solo' | 'multiplayer' = 'solo';
  private roomCode = 'ARENA-BOTS';
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

  // Showcase avatar (Title / Lobby / Wardrobe)
  private showcaseRig: CharacterRig | null = null;
  private lobbyStageGroup: THREE.Group | null = null;
  private lobbyStageDisposables: Array<{ dispose: () => void }> = [];
  private lobbyOrbitRing: THREE.Mesh | null = null;
  private shopOrbitYaw = 0.25;
  private isDraggingShowcase = false;
  private lastDragX = 0;
  private lastDragY = 0;

  // Bots, Remote Players & Grenades
  private bots: BotActor[] = [];
  private remotePlayers = new Map<string, RemoteActor>();
  private activeGrenades: ActiveGrenade[] = [];
  private explosionWaves: ExplosionWave[] = [];
  private raycaster = new THREE.Raycaster();

  // Shared grenade & fire death geometries
  private grenadeBodyGeo = new THREE.SphereGeometry(0.11, 10, 8);
  private grenadeCapGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.06, 8);
  private grenadeLedGeo = new THREE.SphereGeometry(0.032, 6, 6);
  private waveGeo = new THREE.SphereGeometry(1, 18, 14);
  private fireFlameGeo = new THREE.SphereGeometry(0.24, 9, 8);
  private fireRingGeo = new THREE.RingGeometry(0.28, 0.56, 26);
  private grenadeBodyMat = new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.65, metalness: 0.4 });
  private grenadeCapMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.85 });

  // Pooled tracers, sparks & dynamic fire death effects
  private tracerPool: TracerBeam[] = [];
  private sparkPool: SparkParticle[] = [];
  private fireFlames: FireFlameParticle[] = [];
  private fireRings: FireRingEffect[] = [];
  private fireLights: FireFlashLight[] = [];
  private tracerGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6);
  private sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);

  // Input state (PC + Touch)
  private heldKeys = new Set<string>();
  private touchMoveVec = new THREE.Vector2(0, 0);
  private touchFiring = false;
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
  private onTouchStartShowcaseBound: (e: TouchEvent) => void;
  private onTouchMoveShowcaseBound: (e: TouchEvent) => void;
  private onTouchEndShowcaseBound: () => void;
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

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
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

    this.camera = new THREE.PerspectiveCamera(74, w / h, 0.08, 220);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Post-processing EffectComposer (skipped on software WebGL per skill guideline)
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.combatPass = new ShaderPass(CombatPostProcessShader);
      this.composer.addPass(this.combatPass);
      this.composer.addPass(new OutputPass());
    }

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

    // Build Arena & Lobby Pedestal Stage
    this.arena = buildTacticalArena(this.renderer);
    this.scene.add(this.arena.group);

    this.buildLobbyStage();
    this.rebuildShowcaseAvatar();
    this.rebuildFirstPersonWeapon();

    // Pre-allocate tracer & spark pools
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(this.tracerGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracerPool.push({ mesh, life: 0, maxLife: 0.08 });
    }
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparkPool.push({ mesh, vel: new THREE.Vector3(), life: 0 });
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.onResizeBound = this.handleResize.bind(this);
    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onMouseMoveBound = this.handleMouseMove.bind(this);
    this.onMouseDownBound = this.handleMouseDown.bind(this);
    this.onMouseUpBound = this.handleMouseUp.bind(this);
    this.onTouchStartShowcaseBound = this.handleTouchStartShowcase.bind(this);
    this.onTouchMoveShowcaseBound = this.handleTouchMoveShowcase.bind(this);
    this.onTouchEndShowcaseBound = this.handleTouchEndShowcase.bind(this);
    this.onPointerLockChangeBound = this.handlePointerLockChange.bind(this);
    this.onBlurBound = this.handleWindowBlur.bind(this);

    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    this.renderer.domElement.addEventListener('touchstart', this.onTouchStartShowcaseBound, { passive: true });
    this.renderer.domElement.addEventListener('touchmove', this.onTouchMoveShowcaseBound, { passive: true });
    window.addEventListener('touchend', this.onTouchEndShowcaseBound);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    window.addEventListener('blur', this.onBlurBound);

    this.clock.start();
    this.tick();
  }

  public setTouchDevice(isTouch: boolean) {
    this.isTouchDevice = isTouch;
  }

  public setTouchMove(x: number, y: number) {
    this.touchMoveVec.set(x, y);
  }

  public applyTouchLook(dx: number, dy: number) {
    if (this.viewMode !== 'playing' || this.paused || this.chatOpen || this.matchFinished) return;
    this.yaw -= dx * this.sensitivity * 1.9;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * this.sensitivity * 1.9,
      -Math.PI / 2.2,
      Math.PI / 2.2,
    );
  }

  public setTouchFiring(firing: boolean) {
    this.touchFiring = firing;
  }

  public triggerJump() {
    if (this.viewMode === 'playing' && !this.paused && this.alive && this.onGround) {
      this.playerVel.y = 7.4;
      this.onGround = false;
      soundEngine.playFootstep();
    }
  }

  public triggerReload() {
    if (this.viewMode === 'playing' && !this.paused && this.alive) {
      this.startReload();
    }
  }

  public triggerGrenade() {
    if (this.viewMode === 'playing' && !this.paused && !this.chatOpen && this.alive) {
      this.throwPlayerGrenade();
    }
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
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (mode === 'shop') {
      // Shift framing slightly right so left wardrobe drawer never covers the character
      this.camera.setViewOffset(w, h, -w * 0.14, 0, w, h);
    } else {
      this.camera.clearViewOffset();
    }

    if (mode !== 'playing') {
      this.exitPointerLock();
      this.clearBots();
      this.clearRemotePlayers();
      this.clearGrenades();
      this.clearFireEffects();
      this.lowHealthIntensity = 0;
      this.grenadeShockIntensity = 0;
      if (this.fpWeapon) this.fpWeapon.root.visible = false;
      if (this.showcaseRig) this.showcaseRig.root.visible = true;
      if (this.lobbyStageGroup) this.lobbyStageGroup.visible = true;
    } else {
      if (this.showcaseRig) this.showcaseRig.root.visible = false;
      if (this.lobbyStageGroup) this.lobbyStageGroup.visible = false;
      if (this.fpWeapon) this.fpWeapon.root.visible = true;
    }
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.heldKeys.clear();
      this.touchMoveVec.set(0, 0);
      this.touchFiring = false;
      this.mouseDown = false;
      this.exitPointerLock();
    }
  }

  public setChatOpen(open: boolean) {
    this.chatOpen = open;
    if (open) {
      this.heldKeys.clear();
      this.touchMoveVec.set(0, 0);
      this.touchFiring = false;
      this.mouseDown = false;
      this.exitPointerLock();
    }
  }

  public requestPointerLock() {
    if (this.isTouchDevice) return;
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

  public startSoloBotMatch(difficulty: BotDifficulty) {
    this.matchMode = 'solo';
    this.roomCode = 'ARENA-BOTS';
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

  public handleRemoteGrenadeThrown(
    ownerId: string,
    ownerName: string,
    origin: [number, number, number],
    velocity: [number, number, number],
  ) {
    this.spawnGrenadeEntity(
      new THREE.Vector3(origin[0], origin[1], origin[2]),
      new THREE.Vector3(velocity[0], velocity[1], velocity[2]),
      ownerId,
      ownerName,
      false,
    );
  }

  public handleRemoteDamaged(targetId: string, hp: number, headshot: boolean, explosive = false) {
    if (targetId === this.playerId) {
      this.hp = hp;
      this.damageFlash = 0.85;
      this.cameraShake = Math.max(this.cameraShake, explosive ? 0.18 : 0.08);
      if (explosive) {
        this.grenadeShockIntensity = 1.0;
      }
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
        actor.hitFlashTimer = headshot ? 0.2 : 0.14;
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
      if (this.kills % 2 === 0 && this.grenades < this.maxGrenades) {
        this.grenades += 1;
      }
      this.hitstopTimer = 0.045;
      soundEngine.playKillConfirm();
    }
    const victim = this.remotePlayers.get(victimId);
    if (victimId === this.playerId) {
      this.spawnFireDeathEffect(this.playerPos);
    } else if (victim) {
      this.spawnFireDeathEffect(victim.rig.root.position);
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
      this.grenades = Math.max(this.grenades, 1);
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
    this.grenades = 2;
    this.grenadeThrowCooldown = 0;
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
    this.lowHealthIntensity = 0;
    this.grenadeShockIntensity = 0;
    this.killFeed = [];
    this.clearGrenades();
    this.clearFireEffects();
  }

  private buildLobbyStage() {
    const group = new THREE.Group();
    group.position.set(0, 2.0, 0);
    const track = <T extends { dispose: () => void }>(d: T): T => {
      this.lobbyStageDisposables.push(d);
      return d;
    };

    const baseGeo = track(new THREE.CylinderGeometry(1.45, 1.65, 0.14, 32));
    const baseMat = track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.78 }));
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.07;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const glowRingGeo = track(new THREE.RingGeometry(1.18, 1.36, 48));
    const glowRingMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      }),
    );
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.012;
    group.add(glowRing);

    const innerRingGeo = track(new THREE.RingGeometry(0.78, 0.85, 36));
    const innerRingMat = track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      }),
    );
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.015;
    group.add(innerRing);
    this.lobbyOrbitRing = innerRing;

    // Lobby accent lights framing the operator
    const warmLight = new THREE.PointLight(0xf59e0b, 3.2, 8);
    warmLight.position.set(1.8, 2.2, 1.8);
    const coolLight = new THREE.PointLight(0x38bdf8, 2.6, 8);
    coolLight.position.set(-1.9, 1.8, -1.5);
    group.add(warmLight, coolLight);

    group.visible = this.viewMode !== 'playing';
    this.scene.add(group);
    this.lobbyStageGroup = group;
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
        grenadeCooldown: 6 + Math.random() * 6,
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

  private clearGrenades() {
    for (const g of this.activeGrenades) {
      this.scene.remove(g.group);
      g.ledMat.dispose();
    }
    this.activeGrenades = [];
    for (const w of this.explosionWaves) {
      this.scene.remove(w.mesh);
      w.mat.dispose();
    }
    this.explosionWaves = [];
  }

  private handleResize() {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    if (this.viewMode === 'shop') {
      this.camera.setViewOffset(w, h, -w * 0.14, 0, w, h);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
  }

  private handleWindowBlur() {
    this.heldKeys.clear();
    this.touchMoveVec.set(0, 0);
    this.touchFiring = false;
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

    if (e.code === 'KeyG' && !this.paused && this.alive) {
      this.throwPlayerGrenade();
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
    if (this.viewMode === 'shop' || this.viewMode === 'lobby') {
      this.isDraggingShowcase = true;
      this.lastDragX = e.clientX;
      return;
    }
    if (this.viewMode !== 'playing' || this.paused || this.chatOpen || this.matchFinished) return;

    if (!this.pointerLocked && !this.isTouchDevice) {
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

  private handleTouchStartShowcase(e: TouchEvent) {
    if ((this.viewMode === 'lobby' || this.viewMode === 'shop') && e.touches.length === 1) {
      this.isDraggingShowcase = true;
      this.lastDragX = e.touches[0].clientX;
    }
  }

  private handleTouchMoveShowcase(e: TouchEvent) {
    if ((this.viewMode === 'lobby' || this.viewMode === 'shop') && this.isDraggingShowcase && e.touches.length === 1) {
      const dx = e.touches[0].clientX - this.lastDragX;
      this.lastDragX = e.touches[0].clientX;
      this.shopOrbitYaw += dx * 0.012;
    }
  }

  private handleTouchEndShowcase() {
    if (this.viewMode !== 'playing') {
      this.isDraggingShowcase = false;
    }
  }

  private handleMouseMove(e: MouseEvent) {
    if ((this.viewMode === 'shop' || this.viewMode === 'lobby') && this.isDraggingShowcase) {
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
    } else if (this.isDraggingShowcase && !this.isTouchDevice) {
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

  private throwPlayerGrenade() {
    if (this.grenades <= 0 || this.grenadeThrowCooldown > 0) return;
    this.grenades -= 1;
    this.grenadeThrowCooldown = 0.7;
    soundEngine.playGrenadeThrow();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const origin = this.camera.position.clone().addScaledVector(forward, 0.75);
    const vel = forward.multiplyScalar(17.5);
    vel.y += 4.6;

    this.spawnGrenadeEntity(origin, vel, this.playerId, this.playerName, true);
    if (this.matchMode === 'multiplayer') {
      this.callbacks.onMultiplayerGrenadeThrow?.(
        [origin.x, origin.y, origin.z],
        [vel.x, vel.y, vel.z],
      );
    }
    this.emitHud(true);
  }

  private spawnGrenadeEntity(
    origin: THREE.Vector3,
    vel: THREE.Vector3,
    ownerId: string,
    ownerName: string,
    isLocalOwner: boolean,
  ) {
    const group = new THREE.Group();
    group.position.copy(origin);

    const body = new THREE.Mesh(this.grenadeBodyGeo, this.grenadeBodyMat);
    body.castShadow = true;
    const cap = new THREE.Mesh(this.grenadeCapGeo, this.grenadeCapMat);
    cap.position.y = 0.11;

    const ledMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const led = new THREE.Mesh(this.grenadeLedGeo, ledMat);
    led.position.y = 0.15;

    group.add(body, cap, led);
    this.scene.add(group);

    this.activeGrenades.push({
      group,
      ledMat,
      pos: origin.clone(),
      vel: vel.clone(),
      fuse: 1.75,
      ownerId,
      ownerName,
      isLocalOwner,
    });
  }

  private detonateGrenade(g: ActiveGrenade) {
    this.scene.remove(g.group);
    g.ledMat.dispose();

    const blastPos = g.pos.clone();
    const distToPlayer = blastPos.distanceTo(this.playerPos);
    const audioAtten = Math.max(0.2, 1 - distToPlayer / 45);
    soundEngine.playExplosion(audioAtten);

    // Expanding shockwave sphere
    const waveMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.65,
      wireframe: false,
    });
    const waveMesh = new THREE.Mesh(this.waveGeo, waveMat);
    waveMesh.position.copy(blastPos);
    waveMesh.scale.setScalar(0.3);
    this.scene.add(waveMesh);
    this.explosionWaves.push({ mesh: waveMesh, mat: waveMat, life: 0.36, maxLife: 0.36 });

    this.spawnSparks(blastPos, '#f97316', 18);

    const maxRadius = 8.0;
    const shockRadius = 13.0;

    // Trigger post-processing concussion distortion + camera shake if player is nearby
    if (distToPlayer < shockRadius) {
      const shockStrength = Math.pow(1 - distToPlayer / shockRadius, 0.75);
      this.grenadeShockIntensity = Math.max(this.grenadeShockIntensity, shockStrength);
      this.cameraShake = Math.max(this.cameraShake, shockStrength * 0.28);
    }

    // Apply damage in Solo mode (to player + all bots)
    if (this.matchMode === 'solo') {
      if (this.alive && distToPlayer < maxRadius) {
        const selfFactor = g.isLocalOwner ? 0.5 : 1.0;
        const dmg = Math.round((1 - distToPlayer / maxRadius) * 88 * selfFactor);
        if (dmg > 0) {
          this.hp = Math.max(0, this.hp - dmg);
          this.damageFlash = 0.9;
          soundEngine.playDamage();
            if (this.hp <= 0) {
              this.spawnFireDeathEffect(this.playerPos);
              this.alive = false;
              this.deaths += 1;
              this.respawnTimer = 3.0;
              const killerBot = this.bots.find((b) => b.id === g.ownerId);
              if (killerBot) {
                killerBot.kills += 1;
                killerBot.score += 125;
              }
              this.pushKillFeed(g.isLocalOwner ? 'Granada' : g.ownerName, this.playerName, false);
            }
          }
        }

      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const d = blastPos.distanceTo(bot.pos);
        if (d < maxRadius) {
          const dmg = Math.round((1 - d / maxRadius) * 92);
          if (dmg > 0) {
            bot.hp = Math.max(0, bot.hp - dmg);
            bot.hitFlashTimer = 0.18;
            if (g.isLocalOwner) {
              this.damageDealt += dmg;
              this.hitmarkerState = 'body';
              this.hitmarkerTimer = 0.16;
            }
            if (bot.hp <= 0) {
              this.spawnFireDeathEffect(bot.pos);
              bot.alive = false;
              bot.deaths += 1;
              bot.respawnTimer = 3.0;
              bot.rig.root.visible = false;
              bot.laserLine.visible = false;

              if (g.isLocalOwner) {
                this.kills += 1;
                this.score += 125;
                if (this.kills % 2 === 0 && this.grenades < this.maxGrenades) {
                  this.grenades += 1;
                }
                this.hitstopTimer = 0.045;
                soundEngine.playKillConfirm();
                this.pushKillFeed(this.playerName, bot.name, false);
                if (this.kills >= this.killTarget) this.finishMatch();
              } else {
                const killerBot = this.bots.find((b) => b.id === g.ownerId);
                if (killerBot && killerBot.id !== bot.id) {
                  killerBot.kills += 1;
                  killerBot.score += 125;
                  this.pushKillFeed(killerBot.name, bot.name, false);
                  if (killerBot.kills >= this.killTarget) this.finishMatch();
                } else {
                  this.pushKillFeed('Granada', bot.name, false);
                }
              }
            }
          }
        }
      }
    } else if (g.isLocalOwner) {
      // Multiplayer authoritative damage report from thrower
      if (this.alive && distToPlayer < maxRadius) {
        const dmg = Math.round((1 - distToPlayer / maxRadius) * 45);
        if (dmg > 0) this.callbacks.onMultiplayerGrenadeDamage?.(this.playerId, dmg);
      }
      for (const actor of this.remotePlayers.values()) {
        if (!actor.state.alive) continue;
        const d = blastPos.distanceTo(actor.rig.root.position);
        if (d < maxRadius) {
          const dmg = Math.round((1 - d / maxRadius) * 90);
          if (dmg > 0) {
            this.damageDealt += dmg;
            this.hitmarkerState = 'body';
            this.hitmarkerTimer = 0.16;
            this.callbacks.onMultiplayerGrenadeDamage?.(actor.state.id, dmg);
          }
        }
      }
    }
  }

  private updateGrenades(dt: number) {
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuse -= dt;
      g.vel.y -= 18 * dt;

      g.pos.x += g.vel.x * dt;
      g.pos.y += g.vel.y * dt;
      g.pos.z += g.vel.z * dt;

      // Arena boundary & obstacle bounce
      const prevX = g.pos.x;
      const prevZ = g.pos.z;
      resolveObstacleCollision(this.arena, g.pos, 0.16, g.pos.y);
      if (Math.abs(g.pos.x - prevX) > 0.001) g.vel.x *= -0.45;
      if (Math.abs(g.pos.z - prevZ) > 0.001) g.vel.z *= -0.45;

      const floorY = getGroundHeightAt(this.arena, g.pos.x, g.pos.z, g.pos.y) + 0.12;
      if (g.pos.y <= floorY) {
        g.pos.y = floorY;
        if (Math.abs(g.vel.y) > 1.2) {
          g.vel.y = -g.vel.y * 0.42;
          g.vel.x *= 0.72;
          g.vel.z *= 0.72;
        } else {
          g.vel.y = 0;
          g.vel.x *= 0.85;
          g.vel.z *= 0.85;
        }
      }

      g.group.position.copy(g.pos);
      g.group.rotation.x += g.vel.z * dt * 2.5;
      g.group.rotation.z -= g.vel.x * dt * 2.5;

      // Blinking fuse LED
      const blink = Math.sin(g.fuse * 26) > 0;
      g.ledMat.color.setHex(blink ? 0xff2222 : 0x330000);

      if (g.fuse <= 0) {
        this.activeGrenades.splice(i, 1);
        this.detonateGrenade(g);
      }
    }

    for (let i = this.explosionWaves.length - 1; i >= 0; i--) {
      const w = this.explosionWaves[i];
      w.life -= dt;
      const t = 1 - Math.max(0, w.life / w.maxLife);
      w.mesh.scale.setScalar(0.5 + t * 7.2);
      w.mat.opacity = Math.max(0, (1 - t) * 0.65);
      if (w.life <= 0) {
        this.scene.remove(w.mesh);
        w.mat.dispose();
        this.explosionWaves.splice(i, 1);
      }
    }
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

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 140;

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

    const hitPoint = _vec3b.copy(this.camera.position).addScaledVector(this.raycaster.ray.direction, 65);
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

      if (this.matchMode === 'solo') {
        const bot = this.bots.find((b) => b.id === hitEntityId);
        if (bot && bot.alive) {
          const dmg = isHeadshot ? 68 : 34;
          bot.hp = Math.max(0, bot.hp - dmg);
          this.damageDealt += dmg;
          bot.hitFlashTimer = 0.12;
          if (bot.hp <= 0) {
            this.spawnFireDeathEffect(bot.pos);
            bot.alive = false;
            bot.deaths += 1;
            bot.respawnTimer = 3.0;
            bot.rig.root.visible = false;
            bot.laserLine.visible = false;
            this.kills += 1;
            if (isHeadshot) this.headshots += 1;
            this.score += isHeadshot ? 150 : 100;
            if (this.kills % 2 === 0 && this.grenades < this.maxGrenades) {
              this.grenades += 1;
            }
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
        s.vel.set((Math.random() - 0.5) * 7.5, 1.8 + Math.random() * 4.5, (Math.random() - 0.5) * 7.5);
        s.life = 0.3;
        spawned += 1;
        if (spawned >= count) break;
      }
    }
  }

  private spawnFireDeathEffect(pos: THREE.Vector3) {
    soundEngine.playFireDeath();
    this.spawnSparks(new THREE.Vector3(pos.x, pos.y + 0.9, pos.z), '#fb923c', 14);

    // Rising swirling flame plumes
    const palette = [0xfef08a, 0xf97316, 0xef4444, 0xfb923c];
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: palette[i % palette.length],
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.fireFlameGeo, mat);
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
      const r = Math.random() * 0.36;
      mesh.position.set(
        pos.x + Math.cos(angle) * r,
        pos.y + 0.25 + Math.random() * 1.15,
        pos.z + Math.sin(angle) * r,
      );
      const baseScale = 0.65 + Math.random() * 0.9;
      mesh.scale.setScalar(baseScale);
      this.scene.add(mesh);

      const maxLife = 0.65 + Math.random() * 0.55;
      this.fireFlames.push({
        mesh,
        mat,
        vel: new THREE.Vector3(
          Math.cos(angle) * (0.6 + Math.random() * 1.2),
          2.2 + Math.random() * 2.8,
          Math.sin(angle) * (0.6 + Math.random() * 1.2),
        ),
        life: maxLife,
        maxLife,
        baseScale,
        swirlPhase: Math.random() * Math.PI * 2,
      });
    }

    // Expanding ground fire ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff6b1a,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.fireRingGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(pos.x, pos.y + 0.06, pos.z);
    this.scene.add(ringMesh);
    this.fireRings.push({ mesh: ringMesh, mat: ringMat, life: 0.85, maxLife: 0.85 });

    // Dynamic fire illumination flash
    if (!this.isSoftwareGl) {
      const light = new THREE.PointLight(0xff5a1f, 6.0, 12);
      light.position.set(pos.x, pos.y + 1.1, pos.z);
      this.scene.add(light);
      this.fireLights.push({ light, life: 0.9, maxLife: 0.9 });
    }
  }

  private clearFireEffects() {
    for (const f of this.fireFlames) {
      this.scene.remove(f.mesh);
      f.mat.dispose();
    }
    this.fireFlames = [];
    for (const r of this.fireRings) {
      this.scene.remove(r.mesh);
      r.mat.dispose();
    }
    this.fireRings = [];
    for (const l of this.fireLights) {
      this.scene.remove(l.light);
      l.light.dispose();
    }
    this.fireLights = [];
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
    for (let i = this.fireFlames.length - 1; i >= 0; i--) {
      const f = this.fireFlames[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mat.dispose();
        this.fireFlames.splice(i, 1);
        continue;
      }
      const progress = 1 - f.life / f.maxLife;
      f.swirlPhase += dt * 10;
      f.mesh.position.x += (f.vel.x + Math.cos(f.swirlPhase) * 0.5) * dt;
      f.mesh.position.y += f.vel.y * dt;
      f.mesh.position.z += (f.vel.z + Math.sin(f.swirlPhase) * 0.5) * dt;
      const scaleCurve = progress < 0.3 ? 0.8 + progress * 2.2 : Math.max(0.05, 1.45 * (1 - (progress - 0.3) / 0.7));
      f.mesh.scale.set(f.baseScale * scaleCurve, f.baseScale * scaleCurve * 1.45, f.baseScale * scaleCurve);
      f.mat.opacity = Math.max(0, (1 - progress) * 0.92);
    }
    for (let i = this.fireRings.length - 1; i >= 0; i--) {
      const r = this.fireRings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mat.dispose();
        this.fireRings.splice(i, 1);
        continue;
      }
      const progress = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(0.8 + progress * 3.8);
      r.mat.opacity = Math.max(0, (1 - progress) * 0.9);
    }
    for (let i = this.fireLights.length - 1; i >= 0; i--) {
      const l = this.fireLights[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.scene.remove(l.light);
        l.light.dispose();
        this.fireLights.splice(i, 1);
        continue;
      }
      const ratio = l.life / l.maxLife;
      l.light.intensity = ratio * (5.2 + Math.sin(performance.now() * 0.04) * 1.2);
    }
  }

  private updatePlayer(dt: number) {
    if (this.paused || this.matchFinished) return;

    this.matchElapsed += dt;
    if (this.matchMode === 'solo' && this.matchElapsed >= this.matchDuration) {
      this.finishMatch();
      return;
    }

    // Post-process intensities decay smoothly even during respawn
    const targetLowHp = this.alive && this.hp < 50 ? (50 - this.hp) / 50 : 0;
    this.lowHealthIntensity = THREE.MathUtils.damp(this.lowHealthIntensity, targetLowHp, 6, dt);
    this.grenadeShockIntensity = THREE.MathUtils.damp(this.grenadeShockIntensity, 0, 2.8, dt);

    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.matchMode === 'solo' && this.respawnTimer <= 0) {
        const spawn = this.arena.spawnPoints[Math.floor(Math.random() * this.arena.spawnPoints.length)];
        this.playerPos.copy(spawn);
        this.playerVel.set(0, 0, 0);
        this.hp = 100;
        this.alive = true;
        this.ammo = this.maxAmmo;
        this.grenades = Math.max(this.grenades, 1);
        this.reloading = false;
      }
      return;
    }

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

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.grenadeThrowCooldown = Math.max(0, this.grenadeThrowCooldown - dt);
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 14, dt);
    this.weaponKick = THREE.MathUtils.damp(this.weaponKick, 0, 16, dt);
    this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 16, dt);
    this.damageFlash = THREE.MathUtils.damp(this.damageFlash, 0, 8, dt);
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.hitmarkerState = 'none';
    }

    if ((this.mouseDown || this.touchFiring) && !this.chatOpen) {
      this.tryShoot();
    }

    // Combined Keyboard + Android Touch Analog Movement
    let moveF = 0;
    let moveR = 0;
    if (!this.chatOpen) {
      if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) moveF += 1;
      if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) moveF -= 1;
      if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) moveR -= 1;
      if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) moveR += 1;
      moveF += this.touchMoveVec.y;
      moveR += this.touchMoveVec.x;
    }

    const touchSprint = this.touchMoveVec.length() > 0.85;
    const sprinting = (this.heldKeys.has('ShiftLeft') || touchSprint) && moveF > 0.2 && this.stamina > 5;
    if (sprinting && (Math.abs(moveF) > 0.05 || Math.abs(moveR) > 0.05)) {
      this.stamina = Math.max(0, this.stamina - 28 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 20 * dt);
    }

    const speed = sprinting ? 9.6 : 6.4;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    const wishX = -sinY * moveF + cosY * moveR;
    const wishZ = -cosY * moveF - sinY * moveR;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.05) {
      const normScale = Math.min(1, wishLen);
      this.playerVel.x = (wishX / wishLen) * speed * normScale;
      this.playerVel.z = (wishZ / wishLen) * speed * normScale;
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
    if (this.matchMode !== 'solo' || this.paused || this.matchFinished) return;

    const accuracyMap: Record<BotDifficulty, number> = { recluta: 0.25, veterano: 0.45, elite: 0.68 };
    const speedMap: Record<BotDifficulty, number> = { recluta: 3.6, veterano: 4.8, elite: 5.8 };
    const botSpeed = speedMap[this.difficulty];
    const botAccuracy = accuracyMap[this.difficulty];

    for (const bot of this.bots) {
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

      bot.grenadeCooldown = Math.max(0, bot.grenadeCooldown - dt);

      // Scan ALL alive targets: the human player AND every other alive bot!
      const eyeFrom = _vec3.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
      let chosenTargetType: 'player' | 'bot' | null = null;
      let chosenBot: BotActor | null = null;
      let chosenDist = Infinity;
      let chosenPos = this.playerPos;

      if (this.alive) {
        const dPlayer = bot.pos.distanceTo(this.playerPos);
        const eyeToPlayer = _vec3b.set(this.playerPos.x, this.playerPos.y + 1.5, this.playerPos.z);
        if (dPlayer < 42 && this.hasLineOfSight(eyeFrom, eyeToPlayer)) {
          chosenTargetType = 'player';
          chosenDist = dPlayer;
          chosenPos = this.playerPos;
        }
      }

      for (const other of this.bots) {
        if (other.id === bot.id || !other.alive) continue;
        const dOther = bot.pos.distanceTo(other.pos);
        if (dOther < chosenDist && dOther < 40) {
          const eyeToOther = _vec3b.set(other.pos.x, other.pos.y + 1.5, other.pos.z);
          if (this.hasLineOfSight(eyeFrom, eyeToOther)) {
            chosenTargetType = 'bot';
            chosenBot = other;
            chosenDist = dOther;
            chosenPos = other.pos;
          }
        }
      }

      if (chosenTargetType) {
        bot.yaw = Math.atan2(chosenPos.x - bot.pos.x, chosenPos.z - bot.pos.z);

        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 1.2 + Math.random() * 1.4;
          bot.strafeDir *= -1;
        }

        const forwardMove = chosenDist > 14 ? 0.85 : chosenDist < 7 ? -0.6 : 0;
        const moveX = Math.sin(bot.yaw) * forwardMove + Math.cos(bot.yaw) * bot.strafeDir * 0.7;
        const moveZ = Math.cos(bot.yaw) * forwardMove - Math.sin(bot.yaw) * bot.strafeDir * 0.7;
        const mLen = Math.hypot(moveX, moveZ) || 1;
        bot.pos.x += (moveX / mLen) * botSpeed * dt;
        bot.pos.z += (moveZ / mLen) * botSpeed * dt;

        // Occasional frag grenade throw at medium range
        if (bot.grenadeCooldown <= 0 && chosenDist > 8 && chosenDist < 20 && Math.random() < 0.35) {
          bot.grenadeCooldown = this.difficulty === 'elite' ? 8 : 13;
          const gOrigin = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.55, bot.pos.z);
          const toTarget = chosenPos.clone().sub(bot.pos);
          toTarget.y = 0;
          const dist = Math.max(1, toTarget.length());
          const gVel = toTarget.normalize().multiplyScalar(Math.min(18, dist * 0.95));
          gVel.y = 5.2;
          this.spawnGrenadeEntity(gOrigin, gVel, bot.id, bot.name, false);
          soundEngine.playGrenadeThrow();
        }

        // Fire with windup telegraph
        bot.fireCooldown -= dt;
        if (bot.fireCooldown <= 0) {
          if (bot.windupTimer <= 0) {
            bot.windupTimer = this.difficulty === 'recluta' ? 0.45 : 0.28;
          } else {
            bot.windupTimer -= dt;
            bot.laserLine.visible = true;
            const posAttr = bot.laserLine.geometry.attributes.position as THREE.BufferAttribute;
            posAttr.setXYZ(0, bot.pos.x, bot.pos.y + 1.35, bot.pos.z);
            posAttr.setXYZ(1, chosenPos.x, chosenPos.y + 1.4, chosenPos.z);
            posAttr.needsUpdate = true;

            if (bot.windupTimer <= 0) {
              bot.laserLine.visible = false;
              bot.fireCooldown = this.difficulty === 'recluta' ? 1.1 : this.difficulty === 'veterano' ? 0.75 : 0.5;
              soundEngine.playShoot(true);

              const hitsTarget = Math.random() < botAccuracy;
              const muzzlePos = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.35, bot.pos.z);
              const shotEnd = hitsTarget
                ? new THREE.Vector3(chosenPos.x, chosenPos.y + 1.45, chosenPos.z)
                : new THREE.Vector3(
                    chosenPos.x + (Math.random() - 0.5) * 3,
                    chosenPos.y + 1.2 + (Math.random() - 0.5) * 1.4,
                    chosenPos.z + (Math.random() - 0.5) * 3,
                  );
              this.spawnTracer(muzzlePos, shotEnd, '#ef4444');

              if (hitsTarget) {
                if (chosenTargetType === 'player' && this.alive) {
                  const dmg = this.difficulty === 'recluta' ? 10 : this.difficulty === 'veterano' ? 15 : 20;
                  this.hp = Math.max(0, this.hp - dmg);
                  this.damageFlash = 0.85;
                  this.cameraShake = Math.max(this.cameraShake, 0.085);
                  soundEngine.playDamage();
                  if (this.hp <= 0) {
                    this.spawnFireDeathEffect(this.playerPos);
                    this.alive = false;
                    this.deaths += 1;
                    this.respawnTimer = 3.0;
                    bot.kills += 1;
                    bot.score += 100;
                    this.pushKillFeed(bot.name, this.playerName, false);
                    if (bot.kills >= this.killTarget) this.finishMatch();
                  }
                } else if (chosenTargetType === 'bot' && chosenBot && chosenBot.alive) {
                  const isHead = Math.random() < 0.2;
                  const dmg = isHead ? 55 : 28;
                  chosenBot.hp = Math.max(0, chosenBot.hp - dmg);
                  chosenBot.hitFlashTimer = 0.12;
                  this.spawnSparks(shotEnd, '#ef4444', 4);
                  if (chosenBot.hp <= 0) {
                    this.spawnFireDeathEffect(chosenBot.pos);
                    chosenBot.alive = false;
                    chosenBot.deaths += 1;
                    chosenBot.respawnTimer = 3.0;
                    chosenBot.rig.root.visible = false;
                    chosenBot.laserLine.visible = false;
                    bot.kills += 1;
                    bot.score += isHead ? 150 : 100;
                    this.pushKillFeed(bot.name, chosenBot.name, isHead);
                    if (bot.kills >= this.killTarget) this.finishMatch();
                  }
                }
              }
            }
          }
        }
      } else {
        bot.laserLine.visible = false;
        bot.windupTimer = 0;

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

    if (this.matchMode === 'solo') {
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
      grenades: this.grenades,
      maxGrenades: this.maxGrenades,
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
      lowHealthIntensity: this.lowHealthIntensity,
      grenadeShockIntensity: this.grenadeShockIntensity,
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
    } else if (this.viewMode === 'lobby' || this.viewMode === 'shop') {
      const dist = this.viewMode === 'lobby' ? 3.55 : 3.2;
      const camX = Math.sin(this.shopOrbitYaw) * dist;
      const camZ = Math.cos(this.shopOrbitYaw) * dist;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camX, 6, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 3.18, 6, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, camZ, 6, dt);
      this.camera.lookAt(0, 2.95, 0);
      if (this.showcaseRig) {
        this.showcaseRig.root.rotation.y = 0;
        this.showcaseRig.bodyGroup.position.y = Math.sin(elapsed * 2.0) * 0.015;
      }
      if (this.lobbyOrbitRing) {
        this.lobbyOrbitRing.rotation.z = elapsed * 0.45;
      }
    } else if (this.viewMode === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.updatePlayer(dt);
        this.updateBots(dt);
        this.updateRemoteActors(dt);
        this.updateGrenades(dt);
        this.updateEffects(dt);
      }
      this.emitHud(false);
    }

    if (this.combatPass) {
      this.combatPass.uniforms.time.value = elapsed;
      this.combatPass.uniforms.lowHealth.value = this.viewMode === 'playing' ? this.lowHealthIntensity : 0;
      this.combatPass.uniforms.grenadeShock.value = this.viewMode === 'playing' ? this.grenadeShockIntensity : 0;
    }

    if (this.isSoftwareGl || !this.composer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }

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
    this.renderer.domElement.removeEventListener('touchstart', this.onTouchStartShowcaseBound);
    this.renderer.domElement.removeEventListener('touchmove', this.onTouchMoveShowcaseBound);
    window.removeEventListener('touchend', this.onTouchEndShowcaseBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    window.removeEventListener('blur', this.onBlurBound);

    this.clearBots();
    this.clearRemotePlayers();
    this.clearGrenades();
    this.clearFireEffects();
    this.showcaseRig?.dispose();
    this.lobbyStageDisposables.forEach((d) => d.dispose());
    this.fpWeapon?.dispose();
    this.arena.dispose();
    this.grenadeBodyGeo.dispose();
    this.grenadeCapGeo.dispose();
    this.grenadeLedGeo.dispose();
    this.waveGeo.dispose();
    this.fireFlameGeo.dispose();
    this.fireRingGeo.dispose();
    this.grenadeBodyMat.dispose();
    this.grenadeCapMat.dispose();
    this.tracerGeo.dispose();
    this.sparkGeo.dispose();
    this.tracerPool.forEach((t) => (t.mesh.material as THREE.Material).dispose());
    this.sparkPool.forEach((s) => (s.mesh.material as THREE.Material).dispose());
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
