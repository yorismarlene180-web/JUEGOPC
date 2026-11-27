import { DEFAULT_LOADOUT } from '../data/catalog';
import type { PlayerProfile } from '../types/game';

const STORAGE_KEY = 'battleplayers_profile_v1';

export function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function calcLevel(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 120)) + 1);
}

export function loadProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
      return {
        id: parsed.id || `op_${Math.random().toString(36).slice(2, 10)}`,
        name: parsed.name || 'Operador_PC',
        coins: typeof parsed.coins === 'number' ? parsed.coins : 600,
        xp: typeof parsed.xp === 'number' ? parsed.xp : 0,
        level: calcLevel(typeof parsed.xp === 'number' ? parsed.xp : 0),
        kills: typeof parsed.kills === 'number' ? parsed.kills : 0,
        deaths: typeof parsed.deaths === 'number' ? parsed.deaths : 0,
        wins: typeof parsed.wins === 'number' ? parsed.wins : 0,
        matches: typeof parsed.matches === 'number' ? parsed.matches : 0,
        headshots: typeof parsed.headshots === 'number' ? parsed.headshots : 0,
        clanId: parsed.clanId ?? null,
        clanTag: parsed.clanTag || '',
        ownedItems: Array.isArray(parsed.ownedItems)
          ? parsed.ownedItems
          : Object.values(DEFAULT_LOADOUT),
        loadout: parsed.loadout || { ...DEFAULT_LOADOUT },
        dailyStreak: typeof parsed.dailyStreak === 'number' ? parsed.dailyStreak : 0,
        lastDailyClaimDate: parsed.lastDailyClaimDate || null,
        challengeProgress: parsed.challengeProgress || {},
        claimedChallenges: Array.isArray(parsed.claimedChallenges) ? parsed.claimedChallenges : [],
        achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
        sensitivity: typeof parsed.sensitivity === 'number' ? parsed.sensitivity : 0.0022,
        mutedAudio: Boolean(parsed.mutedAudio),
      };
    }
  } catch {
    // ignore storage errors
  }

  const fresh: PlayerProfile = {
    id: `op_${Math.random().toString(36).slice(2, 10)}`,
    name: 'Operador_PC',
    coins: 600,
    xp: 0,
    level: 1,
    kills: 0,
    deaths: 0,
    wins: 0,
    matches: 0,
    headshots: 0,
    clanId: null,
    clanTag: '',
    ownedItems: Object.values(DEFAULT_LOADOUT),
    loadout: { ...DEFAULT_LOADOUT },
    dailyStreak: 0,
    lastDailyClaimDate: null,
    challengeProgress: {},
    claimedChallenges: [],
    achievements: [],
    sensitivity: 0.0022,
    mutedAudio: false,
  };
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
