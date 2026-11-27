import { DEFAULT_LOADOUT, DEFAULT_OWNED_ITEMS } from '../data/catalog';
import type { PlayerProfile } from '../types/game';

const STORAGE_KEY = 'battleplayers_profile_v1';

export function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function calcLevel(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 120)) + 1);
}

export function normalizeProfile(raw: Partial<PlayerProfile>, fallbackId?: string): PlayerProfile {
  const ownedSet = new Set<string>([
    ...DEFAULT_OWNED_ITEMS,
    ...(Array.isArray(raw.ownedItems) ? raw.ownedItems : []),
  ]);
  const xp = typeof raw.xp === 'number' ? raw.xp : 0;

  return {
    id: raw.id || fallbackId || `op_${Math.random().toString(36).slice(2, 10)}`,
    name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name.slice(0, 20) : 'Operador_PC',
    coins: typeof raw.coins === 'number' ? raw.coins : 600,
    xp,
    level: calcLevel(xp),
    kills: typeof raw.kills === 'number' ? raw.kills : 0,
    deaths: typeof raw.deaths === 'number' ? raw.deaths : 0,
    wins: typeof raw.wins === 'number' ? raw.wins : 0,
    matches: typeof raw.matches === 'number' ? raw.matches : 0,
    headshots: typeof raw.headshots === 'number' ? raw.headshots : 0,
    clanId: raw.clanId ?? null,
    clanTag: typeof raw.clanTag === 'string' ? raw.clanTag : '',
    ownedItems: Array.from(ownedSet),
    loadout: {
      helmet: raw.loadout?.helmet || DEFAULT_LOADOUT.helmet,
      armor: raw.loadout?.armor || DEFAULT_LOADOUT.armor,
      pants: raw.loadout?.pants || DEFAULT_LOADOUT.pants,
      backpack: raw.loadout?.backpack || DEFAULT_LOADOUT.backpack,
      weaponSkin: raw.loadout?.weaponSkin || DEFAULT_LOADOUT.weaponSkin,
      tracer: raw.loadout?.tracer || DEFAULT_LOADOUT.tracer,
    },
    dailyStreak: typeof raw.dailyStreak === 'number' ? raw.dailyStreak : 0,
    lastDailyClaimDate: raw.lastDailyClaimDate || null,
    challengeProgress: raw.challengeProgress && typeof raw.challengeProgress === 'object' ? raw.challengeProgress : {},
    claimedChallenges: Array.isArray(raw.claimedChallenges) ? raw.claimedChallenges : [],
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
    sensitivity: typeof raw.sensitivity === 'number' ? raw.sensitivity : 0.0022,
    mutedAudio: Boolean(raw.mutedAudio),
  };
}

export function loadProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
      const normalized = normalizeProfile(parsed);
      saveProfile(normalized);
      return normalized;
    }
  } catch {
    // ignore storage errors
  }

  const fresh = normalizeProfile({});
  saveProfile(fresh);
  return fresh;
}

export function saveProfile(profile: PlayerProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export async function syncProfileToServer(profile: PlayerProfile): Promise<void> {
  try {
    await fetch('/api/profile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
      keepalive: true,
    });
  } catch {
    // ignore network errors
  }
}

export function beaconProfileToServer(profile: PlayerProfile): void {
  saveProfile(profile);
  const payload = JSON.stringify(profile);
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
      const queued = navigator.sendBeacon('/api/profile/sync', blob);
      if (queued) return;
    }
  } catch {
    // fallback below
  }
  try {
    void fetch('/api/profile/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    });
  } catch {
    // ignore
  }
}

export async function fetchProfileFromServer(playerId: string, name?: string): Promise<PlayerProfile | null> {
  try {
    const query = name ? `?name=${encodeURIComponent(name)}` : '';
    const res = await fetch(`/api/profile/${encodeURIComponent(playerId)}${query}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { profile?: Partial<PlayerProfile> };
    if (!data.profile) return null;
    return normalizeProfile(data.profile, playerId);
  } catch {
    return null;
  }
}
