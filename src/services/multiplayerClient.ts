import type {
  AvatarLoadout,
  ChatMessage,
  ClanInfo,
  LeaderboardEntry,
  RoomPlayerState,
} from '../types/game';

export interface RoomSummary {
  code: string;
  isPrivate: boolean;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}

export type ServerEvent =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | {
      type: 'init:sync';
      leaderboard: LeaderboardEntry[];
      clans: ClanInfo[];
      rooms: RoomSummary[];
      globalChat: ChatMessage[];
    }
  | { type: 'leaderboard:sync'; leaderboard: LeaderboardEntry[]; clans: ClanInfo[] }
  | { type: 'clans:sync'; clans: ClanInfo[] }
  | { type: 'rooms:sync'; rooms: RoomSummary[] }
  | {
      type: 'room:joined';
      room: { code: string; isPrivate: boolean; hostName: string; players: RoomPlayerState[] };
      chat: ChatMessage[];
    }
  | { type: 'player:joined'; player: RoomPlayerState }
  | { type: 'player:left'; playerId: string }
  | { type: 'player:moved'; playerId: string; x: number; y: number; z: number; yaw: number; pitch: number }
  | { type: 'player:fired'; playerId: string; origin: [number, number, number]; hitPoint: [number, number, number]; tracer: string }
  | { type: 'player:damaged'; targetId: string; attackerId: string; hp: number; headshot: boolean; explosive?: boolean }
  | { type: 'player:killed'; killerId: string; killerName: string; victimId: string; victimName: string; headshot: boolean }
  | { type: 'player:respawned'; playerId: string; x: number; y: number; z: number }
  | { type: 'grenade:thrown'; ownerId: string; ownerName: string; origin: [number, number, number]; velocity: [number, number, number] }
  | { type: 'match:ended'; winnerName: string }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'voice:speaking'; playerId: string; speaking: boolean }
  | { type: 'voice:audio'; fromId: string; data: string };

type EventHandler = (event: ServerEvent) => void;

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<EventHandler>();
  private reconnectTimer = 0;
  private closedManually = false;

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedManually = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.emit({ type: 'connected' });
    };

    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as ServerEvent;
        this.emit(parsed);
      } catch {
        // ignore invalid frames
      }
    };

    ws.onclose = () => {
      this.emit({ type: 'disconnected' });
      this.ws = null;
      if (!this.closedManually) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
      }
    };
  }

  public disconnect() {
    this.closedManually = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public subscribe(fn: EventHandler): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(ev: ServerEvent) {
    for (const fn of this.listeners) fn(ev);
  }

  public send(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public joinRoom(params: {
    roomCode: string;
    isPrivate: boolean;
    playerId: string;
    name: string;
    clanTag: string;
    loadout: AvatarLoadout;
  }) {
    this.send({ type: 'room:join', ...params });
  }

  public leaveRoom() {
    this.send({ type: 'room:leave' });
  }

  public sendChat(channel: 'room' | 'global', senderName: string, clanTag: string, text: string) {
    this.send({ type: 'chat:send', channel, senderName, clanTag, text });
  }

  public sendMove(x: number, y: number, z: number, yaw: number, pitch: number) {
    this.send({ type: 'player:move', x, y, z, yaw, pitch });
  }

  public sendShoot(origin: [number, number, number], hitPoint: [number, number, number]) {
    this.send({ type: 'player:shoot', origin, hitPoint });
  }

  public sendHit(targetId: string, headshot: boolean) {
    this.send({ type: 'player:hit', targetId, headshot });
  }

  public sendGrenadeThrow(origin: [number, number, number], velocity: [number, number, number]) {
    this.send({ type: 'grenade:throw', origin, velocity });
  }

  public sendGrenadeDamage(targetId: string, damage: number) {
    this.send({ type: 'grenade:damage', targetId, damage });
  }

  public sendSpeaking(speaking: boolean) {
    this.send({ type: 'voice:speaking', speaking });
  }

  public sendVoiceAudio(data: string) {
    this.send({ type: 'voice:audio', data });
  }
}

export const mpClient = new MultiplayerClient();
