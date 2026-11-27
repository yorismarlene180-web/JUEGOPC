export type AccessoryCategory = 'helmet' | 'armor' | 'backpack' | 'weaponSkin' | 'tracer';

export interface AvatarLoadout {
  helmet: string;
  armor: string;
  backpack: string;
  weaponSkin: string;
  tracer: string;
}

export interface ShopItem {
  id: string;
  name: string;
  category: AccessoryCategory;
  price: number;
  rarity: 'Estándar' | 'Táctico' | 'Élite' | 'Legendario';
  description: string;
  primaryColor: string;
  accentColor: string;
  metalness: number;
  roughness: number;
  emissive?: string;
}

export interface WeeklyChallenge {
  id: string;
  title: string;
  description: string;
  metric: 'kills' | 'headshots' | 'matches' | 'wins' | 'multiplayerMatches';
  target: number;
  rewardCoins: number;
  rewardXp: number;
}

export interface DailyReward {
  day: number;
  label: string;
  coins: number;
  bonusItemId?: string;
}

export interface LeaderboardEntry {
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

export interface ClanInfo {
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

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  clanTag: string;
  text: string;
  timestamp: number;
  channel: 'room' | 'global' | 'system';
}

export interface RoomPlayerState {
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
  isBot?: boolean;
  isSpeaking?: boolean;
  loadout: AvatarLoadout;
}

export interface KillFeedEvent {
  id: string;
  killerName: string;
  victimName: string;
  headshot: boolean;
  timestamp: number;
}

export interface MatchSummary {
  mode: 'offline' | 'multiplayer';
  roomCode: string;
  won: boolean;
  placement: number;
  totalPlayers: number;
  kills: number;
  deaths: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  durationSec: number;
  coinsEarned: number;
  xpEarned: number;
  clanPointsEarned: number;
  unlockedAchievements: string[];
  scoreboard: Array<{
    name: string;
    clanTag: string;
    kills: number;
    deaths: number;
    score: number;
    isSelf: boolean;
    isBot: boolean;
  }>;
}

export interface PlayerProfile {
  id: string;
  name: string;
  coins: number;
  xp: number;
  level: number;
  kills: number;
  deaths: number;
  wins: number;
  matches: number;
  headshots: number;
  clanId: string | null;
  clanTag: string;
  ownedItems: string[];
  loadout: AvatarLoadout;
  dailyStreak: number;
  lastDailyClaimDate: string | null;
  challengeProgress: Record<string, number>;
  claimedChallenges: string[];
  achievements: string[];
  sensitivity: number;
  mutedAudio: boolean;
}
