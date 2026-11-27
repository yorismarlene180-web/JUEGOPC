import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'battleplayers-db.json');

interface AvatarLoadout {
  helmet: string;
  armor: string;
  backpack: string;
  weaponSkin: string;
  tracer: string;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  clanTag: string;
  kills: number;
  deaths: number;
  wins: number;
  matches: number;
  rating: number;
  updatedAt: number;
}

interface ClanInfo {
  id: string;
  tag: string;
  name: string;
  description: string;
  color: string;
  membersCount: number;
  totalPoints: number;
  totalWins: number;
  leaderName: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  clanTag: string;
  text: string;
  timestamp: number;
  channel: 'room' | 'global' | 'system';
}

interface RoomPlayer {
  id: string;
  name: string;
  clanTag: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  score: number;
  isSpeaking: boolean;
  loadout: AvatarLoadout;
  respawnAt: number;
  ws: WebSocket;
}

interface MatchRoom {
  code: string;
  isPrivate: boolean;
  hostName: string;
  players: Map<string, RoomPlayer>;
  chat: ChatMessage[];
  roundEndsAt: number;
  killTarget: number;
}

interface PlayerDirectoryEntry {
  id: string;
  name: string;
  clanTag: string;
  lastSeen: number;
}

interface FriendInfo {
  id: string;
  name: string;
  clanTag: string;
  status: 'online' | 'in_match' | 'offline';
  roomCode: string | null;
  isPrivateRoom: boolean;
  lastSeen: number;
}

interface OnlinePresence {
  playerId: string;
  name: string;
  clanTag: string;
  status: 'online' | 'in_match';
  roomCode: string | null;
  isPrivateRoom: boolean;
  ws: WebSocket;
}

interface PersistedState {
  leaderboard: LeaderboardEntry[];
  clans: ClanInfo[];
  globalChat: ChatMessage[];
  players: Record<string, PlayerDirectoryEntry>;
  friendships: Record<string, string[]>;
}

const DEFAULT_LOADOUT: AvatarLoadout = {
  helmet: 'helmet_ranger',
  armor: 'armor_obsidian',
  backpack: 'pack_standard',
  weaponSkin: 'skin_graphite',
  tracer: 'tracer_amber',
};

const SPAWN_POINTS: Array<[number, number, number]> = [
  [-24, 0, -22],
  [24, 0, 22],
  [-24, 0, 22],
  [24, 0, -22],
  [0, 0, -27],
  [0, 0, 27],
  [-27, 0, 0],
  [27, 0, 0],
];

function createSeedState(): PersistedState {
  const now = Date.now();
  return {
    clans: [
      {
        id: 'clan_valkyria',
        tag: 'VLK',
        name: 'Escuadrón Valkiria',
        description: 'Operadores tácticos de élite en servidores de PC.',
        color: '#f59e0b',
        membersCount: 18,
        totalPoints: 14850,
        totalWins: 64,
        leaderName: 'Cmdt_Vega',
      },
      {
        id: 'clan_lobos',
        tag: 'LBS',
        name: 'Lobos de Hierro',
        description: 'Precisión a larga distancia y control de mapa.',
        color: '#38bdf8',
        membersCount: 14,
        totalPoints: 12420,
        totalWins: 51,
        leaderName: 'Ramiro_ARG',
      },
      {
        id: 'clan_centinela',
        tag: 'CNT',
        name: 'Centinela Sur',
        description: 'Disciplina competitiva en arena 3D.',
        color: '#10b981',
        membersCount: 11,
        totalPoints: 9840,
        totalWins: 39,
        leaderName: 'Nox_MX',
      },
      {
        id: 'clan_espectro',
        tag: 'ESP',
        name: 'División Espectro',
        description: 'Asalto rápido y coordinación por voz.',
        color: '#ef4444',
        membersCount: 9,
        totalPoints: 8310,
        totalWins: 32,
        leaderName: 'Kael_ES',
      },
    ],
    leaderboard: [
      { id: 'seed_1', name: 'Cmdt_Vega', clanTag: 'VLK', kills: 312, deaths: 108, wins: 28, matches: 42, rating: 2480, updatedAt: now },
      { id: 'seed_2', name: 'Ramiro_ARG', clanTag: 'LBS', kills: 264, deaths: 119, wins: 22, matches: 39, rating: 2215, updatedAt: now },
      { id: 'seed_3', name: 'Nox_MX', clanTag: 'CNT', kills: 219, deaths: 104, wins: 19, matches: 34, rating: 2040, updatedAt: now },
      { id: 'seed_4', name: 'Kael_ES', clanTag: 'ESP', kills: 188, deaths: 98, wins: 15, matches: 31, rating: 1890, updatedAt: now },
      { id: 'seed_5', name: 'Sombra_CL', clanTag: 'VLK', kills: 154, deaths: 89, wins: 12, matches: 26, rating: 1710, updatedAt: now },
      { id: 'seed_6', name: 'Titan_CO', clanTag: 'LBS', kills: 131, deaths: 92, wins: 9, matches: 24, rating: 1560, updatedAt: now },
    ],
    globalChat: [
      {
        id: 'sys_welcome',
        senderId: 'system',
        senderName: 'SISTEMA',
        clanTag: '',
        text: 'Bienvenido a BATTLEPLAYERS PC. Crea una sala privada o únete a la arena pública.',
        timestamp: now,
        channel: 'system',
      },
    ],
    players: {},
    friendships: {},
  };
}

function loadState(): PersistedState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (Array.isArray(parsed.leaderboard) && Array.isArray(parsed.clans)) {
        return {
          leaderboard: parsed.leaderboard,
          clans: parsed.clans,
          globalChat: Array.isArray(parsed.globalChat) ? parsed.globalChat : [],
          players: parsed.players && typeof parsed.players === 'object' ? parsed.players : {},
          friendships: parsed.friendships && typeof parsed.friendships === 'object' ? parsed.friendships : {},
        };
      }
    }
  } catch {
    // Fallback to seed state
  }
  return createSeedState();
}

function saveState(state: PersistedState) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Ignore disk write failures on read-only containers
  }
}

const db: PersistedState = loadState();
const rooms = new Map<string, MatchRoom>();
const clientMeta = new Map<WebSocket, { playerId: string; roomCode: string | null }>();
const onlinePresence = new Map<string, OnlinePresence>();

function upsertPlayerDirectory(playerId: string, name: string, clanTag: string) {
  const cleanId = String(playerId || '').trim().slice(0, 40);
  if (!cleanId) return;
  db.players[cleanId] = {
    id: cleanId,
    name: String(name || 'Operador').slice(0, 20),
    clanTag: String(clanTag || '').slice(0, 4).toUpperCase(),
    lastSeen: Date.now(),
  };
}

function findPlayerInfo(targetId: string): PlayerDirectoryEntry | null {
  const online = onlinePresence.get(targetId);
  if (online) {
    return {
      id: online.playerId,
      name: online.name,
      clanTag: online.clanTag,
      lastSeen: Date.now(),
    };
  }
  if (db.players[targetId]) {
    return db.players[targetId];
  }
  const lbEntry = db.leaderboard.find((e) => e.id === targetId);
  if (lbEntry) {
    return {
      id: lbEntry.id,
      name: lbEntry.name,
      clanTag: lbEntry.clanTag,
      lastSeen: lbEntry.updatedAt,
    };
  }
  return null;
}

function buildFriendsList(playerId: string): FriendInfo[] {
  const friendIds = db.friendships[playerId] || [];
  const list: FriendInfo[] = [];
  for (const fid of friendIds) {
    const online = onlinePresence.get(fid);
    if (online && online.ws.readyState === WebSocket.OPEN) {
      list.push({
        id: fid,
        name: online.name,
        clanTag: online.clanTag,
        status: online.status,
        roomCode: online.roomCode,
        isPrivateRoom: online.isPrivateRoom,
        lastSeen: Date.now(),
      });
    } else {
      const info = findPlayerInfo(fid);
      list.push({
        id: fid,
        name: info?.name || fid,
        clanTag: info?.clanTag || '',
        status: 'offline',
        roomCode: null,
        isPrivateRoom: false,
        lastSeen: info?.lastSeen || 0,
      });
    }
  }
  const order = { in_match: 0, online: 1, offline: 2 };
  return list.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
}

function syncFriendsToPlayer(playerId: string) {
  const presence = onlinePresence.get(playerId);
  if (presence && presence.ws.readyState === WebSocket.OPEN) {
    sendJson(presence.ws, {
      type: 'friends:sync',
      friends: buildFriendsList(playerId),
    });
  }
}

function notifyFriendsOf(playerId: string) {
  const friendIds = db.friendships[playerId] || [];
  for (const fid of friendIds) {
    syncFriendsToPlayer(fid);
  }
}

function getOrCreateRoom(code: string, isPrivate: boolean, hostName: string): MatchRoom {
  const existing = rooms.get(code);
  if (existing) return existing;
  const room: MatchRoom = {
    code,
    isPrivate,
    hostName,
    players: new Map(),
    chat: [
      {
        id: `sys_${Date.now()}`,
        senderId: 'system',
        senderName: 'ARENA',
        clanTag: '',
        text: `Sala ${code} lista. Usa T para chatear y V para activar tu micrófono.`,
        timestamp: Date.now(),
        channel: 'system',
      },
    ],
    roundEndsAt: Date.now() + 180_000,
    killTarget: 15,
  };
  rooms.set(code, room);
  return room;
}

getOrCreateRoom('PUBLIC-1', false, 'Servidor Oficial');

function sortedLeaderboard() {
  return [...db.leaderboard].sort((a, b) => b.rating - a.rating || b.kills - a.kills).slice(0, 50);
}

function sortedClans() {
  return [...db.clans].sort((a, b) => b.totalPoints - a.totalPoints || b.totalWins - a.totalWins).slice(0, 30);
}

function serializeRoom(room: MatchRoom) {
  return {
    code: room.code,
    isPrivate: room.isPrivate,
    hostName: room.hostName,
    roundEndsAt: room.roundEndsAt,
    killTarget: room.killTarget,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      clanTag: p.clanTag,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      hp: p.hp,
      alive: p.alive,
      kills: p.kills,
      deaths: p.deaths,
      score: p.score,
      isSpeaking: p.isSpeaking,
      loadout: p.loadout,
    })),
  };
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: MatchRoom, payload: unknown, excludeId?: string) {
  const msg = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (excludeId && player.id === excludeId) continue;
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(msg);
    }
  }
}

function broadcastAll(wss: WebSocketServer, payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function getRoomsSummary() {
  return Array.from(rooms.values())
    .filter((r) => !r.isPrivate || r.players.size > 0)
    .map((r) => ({
      code: r.code,
      isPrivate: r.isPrivate,
      hostName: r.hostName,
      playerCount: r.players.size,
      maxPlayers: 10,
    }));
}

function applyMatchReport(body: {
  playerId: string;
  name: string;
  clanId?: string | null;
  clanTag?: string;
  kills: number;
  deaths: number;
  won: boolean;
  mode: 'solo' | 'multiplayer';
}) {
  const cleanName = String(body.name || 'Operador').slice(0, 20);
  const cleanTag = String(body.clanTag || '').slice(0, 4).toUpperCase();
  const kills = Math.max(0, Math.min(100, Number(body.kills) || 0));
  const deaths = Math.max(0, Math.min(100, Number(body.deaths) || 0));
  const won = Boolean(body.won);
  const ratingDelta = kills * 12 + (won ? 45 : 10) - deaths * 4 + (body.mode === 'multiplayer' ? 20 : 0);

  let entry = db.leaderboard.find((e) => e.id === body.playerId);
  if (!entry) {
    entry = {
      id: body.playerId,
      name: cleanName,
      clanTag: cleanTag,
      kills: 0,
      deaths: 0,
      wins: 0,
      matches: 0,
      rating: 1000,
      updatedAt: Date.now(),
    };
    db.leaderboard.push(entry);
  }
  entry.name = cleanName;
  entry.clanTag = cleanTag;
  entry.kills += kills;
  entry.deaths += deaths;
  entry.matches += 1;
  if (won) entry.wins += 1;
  entry.rating = Math.max(500, entry.rating + ratingDelta);
  entry.updatedAt = Date.now();

  let clanPointsEarned = 0;
  if (body.clanId) {
    const clan = db.clans.find((c) => c.id === body.clanId);
    if (clan) {
      clanPointsEarned = kills * 15 + (won ? 100 : 25);
      clan.totalPoints += clanPointsEarned;
      if (won) clan.totalWins += 1;
    }
  }

  saveState(db);
  return { entry, clanPointsEarned };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // REST Endpoints
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: getRoomsSummary().length });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ leaderboard: sortedLeaderboard(), clans: sortedClans(), rooms: getRoomsSummary() });
  });

  app.get('/api/clans', (_req, res) => {
    res.json({ clans: sortedClans() });
  });

  app.post('/api/clans/create', (req, res) => {
    const { tag, name, description, color, leaderName } = req.body || {};
    const cleanTag = String(tag || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const cleanName = String(name || '').trim().slice(0, 28);
    if (cleanTag.length < 2 || cleanName.length < 3) {
      res.status(400).json({ error: 'La etiqueta debe tener 2-4 caracteres y el nombre al menos 3.' });
      return;
    }
    if (db.clans.some((c) => c.tag === cleanTag)) {
      res.status(409).json({ error: 'Esa etiqueta de clan ya está en uso.' });
      return;
    }
    const newClan: ClanInfo = {
      id: `clan_${Date.now()}`,
      tag: cleanTag,
      name: cleanName,
      description: String(description || 'Clan competitivo de BATTLEPLAYERS.').slice(0, 90),
      color: String(color || '#f59e0b'),
      membersCount: 1,
      totalPoints: 250,
      totalWins: 0,
      leaderName: String(leaderName || 'Operador').slice(0, 20),
    };
    db.clans.push(newClan);
    saveState(db);
    broadcastAll(wss, { type: 'clans:sync', clans: sortedClans() });
    res.json({ clan: newClan, clans: sortedClans() });
  });

  app.post('/api/clans/join', (req, res) => {
    const { clanId, previousClanId } = req.body || {};
    const target = db.clans.find((c) => c.id === clanId);
    if (!target) {
      res.status(404).json({ error: 'Clan no encontrado.' });
      return;
    }
    if (previousClanId && previousClanId !== clanId) {
      const prev = db.clans.find((c) => c.id === previousClanId);
      if (prev && prev.membersCount > 1) prev.membersCount -= 1;
    }
    if (previousClanId !== clanId) {
      target.membersCount += 1;
    }
    saveState(db);
    broadcastAll(wss, { type: 'clans:sync', clans: sortedClans() });
    res.json({ clan: target, clans: sortedClans() });
  });

  app.post('/api/clans/leave', (req, res) => {
    const { clanId } = req.body || {};
    const target = db.clans.find((c) => c.id === clanId);
    if (target && target.membersCount > 1) {
      target.membersCount -= 1;
      saveState(db);
      broadcastAll(wss, { type: 'clans:sync', clans: sortedClans() });
    }
    res.json({ ok: true, clans: sortedClans() });
  });

  app.post('/api/match/report', (req, res) => {
    const result = applyMatchReport(req.body || {});
    broadcastAll(wss, {
      type: 'leaderboard:sync',
      leaderboard: sortedLeaderboard(),
      clans: sortedClans(),
    });
    res.json({
      ok: true,
      clanPointsEarned: result.clanPointsEarned,
      leaderboard: sortedLeaderboard(),
      clans: sortedClans(),
    });
  });

  // Friends Management Endpoints
  app.get('/api/friends/:playerId', (req, res) => {
    const playerId = String(req.params.playerId || '').trim();
    if (!playerId) {
      res.status(400).json({ error: 'ID de jugador inválido.' });
      return;
    }
    res.json({ friends: buildFriendsList(playerId) });
  });

  app.post('/api/friends/add', (req, res) => {
    const playerId = String(req.body?.playerId || '').trim().slice(0, 40);
    const targetId = String(req.body?.targetId || '').trim().slice(0, 40);
    const playerName = String(req.body?.playerName || 'Operador').slice(0, 20);
    const playerClanTag = String(req.body?.clanTag || '').slice(0, 4).toUpperCase();

    if (!playerId || !targetId) {
      res.status(400).json({ error: 'Debes ingresar un ID de jugador válido.' });
      return;
    }
    if (playerId === targetId) {
      res.status(400).json({ error: 'No puedes añadirte a ti mismo como amigo.' });
      return;
    }

    upsertPlayerDirectory(playerId, playerName, playerClanTag);
    const target = findPlayerInfo(targetId);
    if (!target) {
      res.status(404).json({ error: `No se encontró ningún operador registrado con el ID "${targetId}".` });
      return;
    }

    const myFriends = db.friendships[playerId] || [];
    if (myFriends.includes(targetId)) {
      res.status(409).json({ error: `${target.name} ya está en tu lista de amigos.` });
      return;
    }

    db.friendships[playerId] = [...myFriends, targetId];
    const targetFriends = db.friendships[targetId] || [];
    if (!targetFriends.includes(playerId)) {
      db.friendships[targetId] = [...targetFriends, playerId];
    }

    saveState(db);
    syncFriendsToPlayer(playerId);
    syncFriendsToPlayer(targetId);

    res.json({ ok: true, added: target, friends: buildFriendsList(playerId) });
  });

  app.post('/api/friends/remove', (req, res) => {
    const playerId = String(req.body?.playerId || '').trim().slice(0, 40);
    const targetId = String(req.body?.targetId || '').trim().slice(0, 40);
    if (!playerId || !targetId) {
      res.status(400).json({ error: 'Datos inválidos.' });
      return;
    }

    if (db.friendships[playerId]) {
      db.friendships[playerId] = db.friendships[playerId].filter((id) => id !== targetId);
    }
    if (db.friendships[targetId]) {
      db.friendships[targetId] = db.friendships[targetId].filter((id) => id !== playerId);
    }

    saveState(db);
    syncFriendsToPlayer(playerId);
    syncFriendsToPlayer(targetId);

    res.json({ ok: true, friends: buildFriendsList(playerId) });
  });

  // Downloadable Windows (.exe builder via Electron) & Android (.apk builder via Capacitor) Kit
  app.get('/api/download/native-kit', async (req, res) => {
    try {
      const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
      const originUrl = process.env.APP_URL || `${forwardedProto}://${host}`;

      const zip = new JSZip();

      // 1. Windows Electron (.exe) Wrapper
      const winFolder = zip.folder('windows-exe')!;
      winFolder.file(
        'package.json',
        JSON.stringify(
          {
            name: 'battleplayers-desktop',
            version: '1.0.0',
            description: 'BATTLEPLAYERS 3D Tactical Shooter for Windows PC',
            main: 'main.cjs',
            scripts: {
              start: 'electron .',
              'build:exe': 'electron-builder --win nsis',
            },
            build: {
              appId: 'com.battleplayers.desktop',
              productName: 'BATTLEPLAYERS',
              win: {
                target: ['nsis', 'portable'],
                icon: 'icon.png',
              },
              nsis: {
                oneClick: false,
                allowToChangeInstallationDirectory: true,
              },
            },
            devDependencies: {
              electron: '^33.2.0',
              'electron-builder': '^25.1.8',
            },
          },
          null,
          2,
        ),
      );

      winFolder.file(
        'main.cjs',
        `const { app, BrowserWindow, session } = require('electron');

const GAME_URL = ${JSON.stringify(originUrl)};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'BATTLEPLAYERS',
    backgroundColor: '#0a0d12',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'fullscreen' || permission === 'pointerLock') {
      callback(true);
      return;
    }
    callback(false);
  });

  win.loadURL(GAME_URL);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`,
      );

      winFolder.file(
        'CREAR-EXE-WINDOWS.bat',
        `@echo off
echo Instalando dependencias para generar BATTLEPLAYERS.exe...
call npm install
if errorlevel 1 exit /b 1
echo Compilando instalador .exe en carpeta dist\\ ...
call npm run build:exe
pause
`,
      );

      // 2. Android Capacitor (.apk) Horizontal Fullscreen Wrapper
      const androidFolder = zip.folder('android-apk')!;
      androidFolder.file(
        'package.json',
        JSON.stringify(
          {
            name: 'battleplayers-android',
            version: '1.0.0',
            description: 'BATTLEPLAYERS Android Landscape Shooter',
            scripts: {
              'init:android': 'npx cap add android && npx cap sync android',
              'open:studio': 'npx cap open android',
            },
            dependencies: {
              '@capacitor/core': '^6.2.0',
              '@capacitor/android': '^6.2.0',
            },
            devDependencies: {
              '@capacitor/cli': '^6.2.0',
            },
          },
          null,
          2,
        ),
      );

      androidFolder.file(
        'capacitor.config.json',
        JSON.stringify(
          {
            appId: 'com.battleplayers.android',
            appName: 'BATTLEPLAYERS',
            webDir: 'www',
            server: {
              url: originUrl,
              cleartext: false,
            },
            android: {
              allowMixedContent: false,
              backgroundColor: '#0a0d12',
            },
          },
          null,
          2,
        ),
      );

      const wwwFolder = androidFolder.folder('www')!;
      wwwFolder.file(
        'index.html',
        `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${originUrl}"></head><body style="background:#0a0d12;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">Cargando BATTLEPLAYERS...</body></html>`,
      );

      androidFolder.file(
        'AndroidManifest-ORIENTATION-LANDSCAPE.txt',
        `En android/app/src/main/AndroidManifest.xml dentro de <activity android:name=".MainActivity"...>, agrega:
android:screenOrientation="sensorLandscape"
y permisos de microfono e internet:
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />`,
      );

      // Attach PNG icon if present
      const iconPath = path.join(__dirname, 'public', 'pwa-512x512.png');
      if (fs.existsSync(iconPath)) {
        const iconBuf = fs.readFileSync(iconPath);
        winFolder.file('icon.png', iconBuf);
        androidFolder.file('icon.png', iconBuf);
      }

      zip.file(
        'INSTRUCCIONES.txt',
        `BATTLEPLAYERS — KIT NATIVO WINDOWS (.EXE) Y ANDROID (.APK)
Servidor en linea configurado: ${originUrl}

1) PARA WINDOWS (.EXE):
   - Abre la carpeta "windows-exe".
   - Asegurate de tener Node.js instalado en Windows.
   - Haz doble clic en "CREAR-EXE-WINDOWS.bat" (o ejecuta: npm install && npm run build:exe).
   - Tu instalador .exe y version portable se generaran en "windows-exe/dist/".

2) PARA ANDROID (.APK EN HORIZONTAL):
   - Abre la carpeta "android-apk".
   - Ejecuta: npm install && npm run init:android
   - Aplica sensorLandscape en AndroidManifest.xml (ver AndroidManifest-ORIENTATION-LANDSCAPE.txt).
   - Abre en Android Studio con: npm run open:studio y selecciona Build -> Build APK(s).

NOTA: Tambien puedes instalar BATTLEPLAYERS en 1 clic directamente desde Chrome/Edge en Windows o Android sin compilar nada usando el boton "Instalar App" dentro del juego.
`,
      );

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="BATTLEPLAYERS-Windows-EXE-Android-APK-Kit.zip"');
      res.send(zipBuffer);
    } catch (err) {
      console.error('Failed to build native kit zip', err);
      res.status(500).json({ error: 'No se pudo generar el paquete descargable.' });
    }
  });

  // Authoritative 20Hz respawn & round timer loop
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.players.size === 0) continue;

      for (const p of room.players.values()) {
        if (!p.alive && p.respawnAt > 0 && now >= p.respawnAt) {
          const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
          p.alive = true;
          p.hp = 100;
          p.x = spawn[0];
          p.y = spawn[1];
          p.z = spawn[2];
          p.respawnAt = 0;
          broadcastRoom(room, {
            type: 'player:respawned',
            playerId: p.id,
            x: p.x,
            y: p.y,
            z: p.z,
          });
        }
      }

      if (now >= room.roundEndsAt) {
        const sorted = Array.from(room.players.values()).sort((a, b) => b.kills - a.kills || b.score - a.score);
        broadcastRoom(room, {
          type: 'match:ended',
          winnerName: sorted[0]?.name || 'Empate',
          scoreboard: sorted.map((s) => ({
            id: s.id,
            name: s.name,
            clanTag: s.clanTag,
            kills: s.kills,
            deaths: s.deaths,
            score: s.score,
          })),
        });
        room.roundEndsAt = now + 180_000;
        for (const p of room.players.values()) {
          p.kills = 0;
          p.deaths = 0;
          p.score = 0;
          p.hp = 100;
          p.alive = true;
        }
      }
    }
  }, 150);

  // WebSocket handling
  wss.on('connection', (ws) => {
    const tempId = `ws_${Math.random().toString(36).slice(2, 10)}`;
    clientMeta.set(ws, { playerId: tempId, roomCode: null });

    sendJson(ws, {
      type: 'init:sync',
      leaderboard: sortedLeaderboard(),
      clans: sortedClans(),
      rooms: getRoomsSummary(),
      globalChat: db.globalChat.slice(-30),
    });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }

      const meta = clientMeta.get(ws);
      if (!meta) return;

      const type = String(msg.type || '');

      if (type === 'presence:register') {
        const playerId = String(msg.playerId || '').trim().slice(0, 40);
        const name = String(msg.name || 'Operador').slice(0, 20);
        const clanTag = String(msg.clanTag || '').slice(0, 4).toUpperCase();
        const status = msg.status === 'in_match' ? 'in_match' : 'online';
        const roomCode = msg.roomCode ? String(msg.roomCode).slice(0, 16) : null;
        const isPrivateRoom = Boolean(msg.isPrivateRoom);
        if (!playerId) return;

        meta.playerId = playerId;
        upsertPlayerDirectory(playerId, name, clanTag);
        onlinePresence.set(playerId, {
          playerId,
          name,
          clanTag,
          status,
          roomCode,
          isPrivateRoom,
          ws,
        });
        saveState(db);
        syncFriendsToPlayer(playerId);
        notifyFriendsOf(playerId);
        return;
      }

      if (type === 'presence:status') {
        const existing = onlinePresence.get(meta.playerId);
        if (existing && existing.ws === ws) {
          existing.status = msg.status === 'in_match' ? 'in_match' : 'online';
          existing.roomCode = msg.roomCode ? String(msg.roomCode).slice(0, 16) : null;
          existing.isPrivateRoom = Boolean(msg.isPrivateRoom);
          notifyFriendsOf(meta.playerId);
        }
        return;
      }

      if (type === 'invite:send') {
        const toPlayerId = String(msg.toPlayerId || '').trim();
        const roomCode = String(msg.roomCode || '').trim().toUpperCase().slice(0, 12);
        const isPrivate = Boolean(msg.isPrivate);
        const sender = onlinePresence.get(meta.playerId);
        const recipient = onlinePresence.get(toPlayerId);

        if (!roomCode) {
          sendJson(ws, { type: 'invite:error', message: 'Código de sala inválido.' });
          return;
        }
        if (!recipient || recipient.ws.readyState !== WebSocket.OPEN) {
          sendJson(ws, { type: 'invite:error', message: 'El jugador no está conectado en este momento.' });
          return;
        }

        const invite = {
          id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          fromId: meta.playerId,
          fromName: sender?.name || String(msg.fromName || 'Operador').slice(0, 20),
          fromClanTag: sender?.clanTag || String(msg.fromClanTag || '').slice(0, 4).toUpperCase(),
          roomCode,
          isPrivate,
          timestamp: Date.now(),
        };

        sendJson(recipient.ws, { type: 'invite:received', invite });
        sendJson(ws, { type: 'invite:sent', toPlayerId, toName: recipient.name, roomCode });
        return;
      }

      if (type === 'room:join') {
        const requestedCode = String(msg.roomCode || 'PUBLIC-1').trim().toUpperCase().slice(0, 12);
        const isPrivate = Boolean(msg.isPrivate);
        const playerId = String(msg.playerId || meta.playerId);
        const name = String(msg.name || 'Operador').slice(0, 20);
        const clanTag = String(msg.clanTag || '').slice(0, 4).toUpperCase();
        const loadout = (msg.loadout as AvatarLoadout) || DEFAULT_LOADOUT;

        // Leave previous room if any
        if (meta.roomCode && rooms.has(meta.roomCode)) {
          const prevRoom = rooms.get(meta.roomCode)!;
          prevRoom.players.delete(meta.playerId);
          broadcastRoom(prevRoom, { type: 'player:left', playerId: meta.playerId });
        }

        meta.playerId = playerId;
        meta.roomCode = requestedCode;

        upsertPlayerDirectory(playerId, name, clanTag);
        onlinePresence.set(playerId, {
          playerId,
          name,
          clanTag,
          status: 'in_match',
          roomCode: requestedCode,
          isPrivateRoom: isPrivate,
          ws,
        });
        notifyFriendsOf(playerId);

        const room = getOrCreateRoom(requestedCode, isPrivate, name);
        const spawn = SPAWN_POINTS[room.players.size % SPAWN_POINTS.length];
        const player: RoomPlayer = {
          id: playerId,
          name,
          clanTag,
          x: spawn[0],
          y: spawn[1],
          z: spawn[2],
          yaw: 0,
          pitch: 0,
          hp: 100,
          alive: true,
          kills: 0,
          deaths: 0,
          score: 0,
          isSpeaking: false,
          loadout,
          respawnAt: 0,
          ws,
        };
        room.players.set(playerId, player);

        sendJson(ws, {
          type: 'room:joined',
          room: serializeRoom(room),
          chat: room.chat.slice(-40),
        });

        broadcastRoom(
          room,
          {
            type: 'player:joined',
            player: {
              id: player.id,
              name: player.name,
              clanTag: player.clanTag,
              x: player.x,
              y: player.y,
              z: player.z,
              yaw: player.yaw,
              pitch: player.pitch,
              hp: player.hp,
              alive: player.alive,
              kills: player.kills,
              deaths: player.deaths,
              score: player.score,
              isSpeaking: player.isSpeaking,
              loadout: player.loadout,
            },
          },
          playerId,
        );
        broadcastAll(wss, { type: 'rooms:sync', rooms: getRoomsSummary() });
        return;
      }

      if (type === 'room:leave') {
        if (meta.roomCode && rooms.has(meta.roomCode)) {
          const room = rooms.get(meta.roomCode)!;
          room.players.delete(meta.playerId);
          broadcastRoom(room, { type: 'player:left', playerId: meta.playerId });
          if (room.isPrivate && room.players.size === 0) {
            rooms.delete(room.code);
          }
          meta.roomCode = null;
          broadcastAll(wss, { type: 'rooms:sync', rooms: getRoomsSummary() });
        }
        const presence = onlinePresence.get(meta.playerId);
        if (presence && presence.ws === ws) {
          presence.status = 'online';
          presence.roomCode = null;
          presence.isPrivateRoom = false;
          notifyFriendsOf(meta.playerId);
        }
        return;
      }

      if (type === 'chat:send') {
        const text = String(msg.text || '').trim().slice(0, 180);
        if (!text) return;
        const channel = msg.channel === 'global' ? 'global' : 'room';
        const senderName = String(msg.senderName || 'Operador').slice(0, 20);
        const clanTag = String(msg.clanTag || '').slice(0, 4).toUpperCase();
        const chatMsg: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          senderId: meta.playerId,
          senderName,
          clanTag,
          text,
          timestamp: Date.now(),
          channel,
        };

        if (channel === 'global' || !meta.roomCode) {
          db.globalChat.push(chatMsg);
          if (db.globalChat.length > 60) db.globalChat.shift();
          broadcastAll(wss, { type: 'chat:message', message: chatMsg });
        } else {
          const room = rooms.get(meta.roomCode);
          if (room) {
            room.chat.push(chatMsg);
            if (room.chat.length > 60) room.chat.shift();
            broadcastRoom(room, { type: 'chat:message', message: chatMsg });
          }
        }
        return;
      }

      if (!meta.roomCode) return;
      const room = rooms.get(meta.roomCode);
      if (!room) return;
      const player = room.players.get(meta.playerId);
      if (!player) return;

      if (type === 'player:move') {
        player.x = Number(msg.x) || 0;
        player.y = Number(msg.y) || 0;
        player.z = Number(msg.z) || 0;
        player.yaw = Number(msg.yaw) || 0;
        player.pitch = Number(msg.pitch) || 0;
        broadcastRoom(
          room,
          {
            type: 'player:moved',
            playerId: player.id,
            x: player.x,
            y: player.y,
            z: player.z,
            yaw: player.yaw,
            pitch: player.pitch,
          },
          player.id,
        );
      } else if (type === 'player:shoot') {
        if (!player.alive) return;
        broadcastRoom(
          room,
          {
            type: 'player:fired',
            playerId: player.id,
            origin: msg.origin,
            hitPoint: msg.hitPoint,
            tracer: player.loadout.tracer,
          },
          player.id,
        );
      } else if (type === 'player:hit') {
        if (!player.alive) return;
        const targetId = String(msg.targetId || '');
        const headshot = Boolean(msg.headshot);
        const target = room.players.get(targetId);
        if (!target || !target.alive || target.id === player.id) return;

        const dmg = headshot ? 68 : 34;
        target.hp = Math.max(0, target.hp - dmg);
        broadcastRoom(room, {
          type: 'player:damaged',
          targetId: target.id,
          attackerId: player.id,
          hp: target.hp,
          headshot,
        });

        if (target.hp <= 0) {
          target.alive = false;
          target.deaths += 1;
          target.respawnAt = Date.now() + 3000;
          player.kills += 1;
          player.score += headshot ? 150 : 100;

          broadcastRoom(room, {
            type: 'player:killed',
            killerId: player.id,
            killerName: player.name,
            victimId: target.id,
            victimName: target.name,
            headshot,
            killerKills: player.kills,
            killerScore: player.score,
            victimDeaths: target.deaths,
          });

          if (player.kills >= room.killTarget) {
            const sorted = Array.from(room.players.values()).sort((a, b) => b.kills - a.kills || b.score - a.score);
            broadcastRoom(room, {
              type: 'match:ended',
              winnerName: player.name,
              scoreboard: sorted.map((s) => ({
                id: s.id,
                name: s.name,
                clanTag: s.clanTag,
                kills: s.kills,
                deaths: s.deaths,
                score: s.score,
              })),
            });
            room.roundEndsAt = Date.now() + 180_000;
            for (const p of room.players.values()) {
              p.kills = 0;
              p.deaths = 0;
              p.score = 0;
              p.hp = 100;
              p.alive = true;
            }
          }
        }
      } else if (type === 'grenade:throw') {
        if (!player.alive) return;
        broadcastRoom(
          room,
          {
            type: 'grenade:thrown',
            ownerId: player.id,
            ownerName: player.name,
            origin: msg.origin,
            velocity: msg.velocity,
          },
          player.id,
        );
      } else if (type === 'grenade:damage') {
        const targetId = String(msg.targetId || '');
        const dmg = Math.max(0, Math.min(95, Number(msg.damage) || 0));
        const target = room.players.get(targetId);
        if (!target || !target.alive || dmg <= 0) return;

        target.hp = Math.max(0, target.hp - dmg);
        broadcastRoom(room, {
          type: 'player:damaged',
          targetId: target.id,
          attackerId: player.id,
          hp: target.hp,
          headshot: false,
          explosive: true,
        });

        if (target.hp <= 0) {
          target.alive = false;
          target.deaths += 1;
          target.respawnAt = Date.now() + 3000;
          if (target.id !== player.id) {
            player.kills += 1;
            player.score += 125;
          }
          broadcastRoom(room, {
            type: 'player:killed',
            killerId: player.id,
            killerName: target.id === player.id ? 'Granada' : player.name,
            victimId: target.id,
            victimName: target.name,
            headshot: false,
          });
        }
      } else if (type === 'voice:speaking') {
        player.isSpeaking = Boolean(msg.speaking);
        broadcastRoom(
          room,
          {
            type: 'voice:speaking',
            playerId: player.id,
            speaking: player.isSpeaking,
          },
          player.id,
        );
      } else if (type === 'voice:signal') {
        const targetId = String(msg.targetId || '');
        const target = room.players.get(targetId);
        if (target) {
          sendJson(target.ws, {
            type: 'voice:signal',
            fromId: player.id,
            signal: msg.signal,
          });
        }
      } else if (type === 'voice:audio') {
        broadcastRoom(
          room,
          {
            type: 'voice:audio',
            fromId: player.id,
            data: msg.data,
          },
          player.id,
        );
      }
    });

    ws.on('close', () => {
      const meta = clientMeta.get(ws);
      if (meta?.roomCode && rooms.has(meta.roomCode)) {
        const room = rooms.get(meta.roomCode)!;
        room.players.delete(meta.playerId);
        broadcastRoom(room, { type: 'player:left', playerId: meta.playerId });
        if (room.isPrivate && room.players.size === 0) {
          rooms.delete(room.code);
        }
        broadcastAll(wss, { type: 'rooms:sync', rooms: getRoomsSummary() });
      }
      if (meta?.playerId) {
        const current = onlinePresence.get(meta.playerId);
        if (current && current.ws === ws) {
          onlinePresence.delete(meta.playerId);
          upsertPlayerDirectory(meta.playerId, current.name, current.clanTag);
          saveState(db);
          notifyFriendsOf(meta.playerId);
        }
      }
      clientMeta.delete(ws);
    });
  });

  // Vite dev middleware or production static
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`BATTLEPLAYERS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
