import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Coins,
  Copy,
  Crosshair,
  Crown,
  Gift,
  MessageSquare,
  Mic,
  MicOff,
  Pencil,
  Play,
  Plus,
  Send,
  Shield,
  Shirt,
  ShoppingBag,
  Sparkles,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { DAILY_REWARDS, SHOP_ITEMS, WEEKLY_CHALLENGES } from '../data/catalog';
import type { BotDifficulty } from '../game/ThreeEngine';
import type { RoomSummary } from '../services/multiplayerClient';
import type { VoiceStatus } from '../audio/voiceChat';
import type {
  AccessoryCategory,
  ChatMessage,
  ClanInfo,
  FriendInfo,
  LeaderboardEntry,
  PlayerProfile,
  RoomInvite,
} from '../types/game';
import { VerifiedBadge } from './VerifiedBadge';

export type HubTab = 'play' | 'wardrobe' | 'shop' | 'friends' | 'challenges' | 'clans' | 'leaderboard';
type LaunchMode = 'bots' | 'private' | 'public';

interface MainMenuHubProps {
  activeTab: HubTab;
  onTabChange: (tab: HubTab) => void;
  profile: PlayerProfile;
  wsConnected: boolean;
  leaderboard: LeaderboardEntry[];
  clans: ClanInfo[];
  rooms: RoomSummary[];
  globalChat: ChatMessage[];
  friends: FriendInfo[];
  pendingInvites: RoomInvite[];
  inviteNotice: { type: 'success' | 'error'; text: string } | null;
  voice: VoiceStatus;
  canClaimDaily: boolean;
  onNameChange: (name: string) => void;
  onToggleMuteAudio: () => void;
  onToggleMic: () => void;
  onStartOffline: (difficulty: BotDifficulty) => void;
  onJoinMultiplayer: (roomCode: string, isPrivate: boolean) => void;
  onSendGlobalChat: (text: string) => void;
  onBuyOrEquipItem: (itemId: string) => void;
  onClaimDaily: () => void;
  onClaimChallenge: (challengeId: string) => void;
  onCreateClan: (data: { tag: string; name: string; description: string; color: string }) => Promise<string | null>;
  onJoinClan: (clanId: string) => Promise<void>;
  onLeaveClan: () => Promise<void>;
  onAddFriend: (targetId: string) => Promise<{ ok: boolean; message: string }>;
  onRemoveFriend: (targetId: string) => Promise<void>;
  onSendInvite: (toPlayerId: string, roomCode: string, isPrivate: boolean) => void;
  onAcceptInvite: (invite: RoomInvite) => void;
  onDismissInvite: (inviteId: string) => void;
}

const WARDROBE_CATEGORIES: Array<{ id: AccessoryCategory; label: string }> = [
  { id: 'helmet', label: 'Gorras y Cascos' },
  { id: 'armor', label: 'Camisas y Chaquetas' },
  { id: 'pants', label: 'Pantalones y Tenis' },
  { id: 'backpack', label: 'Mochilas' },
  { id: 'weaponSkin', label: 'Armas' },
  { id: 'tracer', label: 'Trazadoras' },
];

export const MainMenuHub: React.FC<MainMenuHubProps> = ({
  activeTab,
  onTabChange,
  profile,
  wsConnected,
  leaderboard,
  clans,
  rooms,
  globalChat,
  friends,
  pendingInvites,
  inviteNotice,
  voice,
  canClaimDaily,
  onNameChange,
  onToggleMuteAudio,
  onToggleMic,
  onStartOffline,
  onJoinMultiplayer,
  onSendGlobalChat,
  onBuyOrEquipItem,
  onClaimDaily,
  onClaimChallenge,
  onCreateClan,
  onJoinClan,
  onLeaveClan,
  onAddFriend,
  onRemoveFriend,
  onSendInvite,
  onAcceptInvite,
  onDismissInvite,
}) => {
  const [launchMode, setLaunchMode] = useState<LaunchMode>('bots');
  const [difficulty, setDifficulty] = useState<BotDifficulty>('veterano');
  const [joinCode, setJoinCode] = useState('');
  const [privateCode, setPrivateCode] = useState(() => `BP-${Math.floor(1000 + Math.random() * 8999)}`);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [shopCat, setShopCat] = useState<AccessoryCategory>('armor');

  // Friends state
  const [friendIdInput, setFriendIdInput] = useState('');
  const [friendFilter, setFriendFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [friendFeedback, setFriendFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [inviteTargetMode, setInviteTargetMode] = useState<'private' | 'public'>('private');
  const [recentlyInvitedIds, setRecentlyInvitedIds] = useState<Record<string, boolean>>({});

  // Create Clan form
  const [clanTag, setClanTag] = useState('');
  const [clanName, setClanName] = useState('');
  const [clanDesc, setClanDesc] = useState('');
  const [clanColor, setClanColor] = useState('#f59e0b');
  const [clanError, setClanError] = useState<string | null>(null);

  const myClan = clans.find((c) => c.id === profile.clanId) || null;
  const onlineFriends = friends.filter((f) => f.status !== 'offline');
  const activeInviteRoom = inviteTargetMode === 'private' ? privateCode : 'PUBLIC-1';
  const activeInviteIsPrivate = inviteTargetMode === 'private';

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(privateCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyPlayerId = async () => {
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleAddFriendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = friendIdInput.trim();
    if (!trimmed) return;
    setAddingFriend(true);
    const res = await onAddFriend(trimmed);
    setAddingFriend(false);
    setFriendFeedback({ ok: res.ok, text: res.message });
    if (res.ok) setFriendIdInput('');
  };

  const handleQuickInvite = (friendId: string, roomOverride?: { code: string; isPrivate: boolean }) => {
    const code = roomOverride?.code ?? activeInviteRoom;
    const isPriv = roomOverride?.isPrivate ?? activeInviteIsPrivate;
    onSendInvite(friendId, code, isPriv);
    setRecentlyInvitedIds((prev) => ({ ...prev, [friendId]: true }));
    setTimeout(() => {
      setRecentlyInvitedIds((prev) => {
        const next = { ...prev };
        delete next[friendId];
        return next;
      });
    }, 3000);
  };

  const handleGlobalChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim()) return;
    onSendGlobalChat(chatDraft.trim());
    setChatDraft('');
  };

  const handleCreateClanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClanError(null);
    const err = await onCreateClan({
      tag: clanTag,
      name: clanName,
      description: clanDesc,
      color: clanColor,
    });
    if (err) {
      setClanError(err);
    } else {
      setClanTag('');
      setClanName('');
      setClanDesc('');
    }
  };

  const handleLaunchMatch = () => {
    if (launchMode === 'bots') {
      onStartOffline(difficulty);
    } else if (launchMode === 'private') {
      const target = joinCode.trim() || privateCode;
      onJoinMultiplayer(target, true);
    } else {
      onJoinMultiplayer('PUBLIC-1', false);
    }
  };

  const isDrawerOpen = activeTab === 'wardrobe' || activeTab === 'shop';
  const isModalOpen =
    activeTab === 'friends' ||
    activeTab === 'challenges' ||
    activeTab === 'clans' ||
    activeTab === 'leaderboard';

  const wardrobeItems = SHOP_ITEMS.filter((i) => i.category === shopCat).sort((a, b) => {
    if (activeTab === 'wardrobe') {
      const aOwned = profile.ownedItems.includes(a.id) ? 0 : 1;
      const bOwned = profile.ownedItems.includes(b.id) ? 0 : 1;
      if (aOwned !== bOwned) return aOwned - bOwned;
    }
    return a.price - b.price;
  });

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none select-none overflow-hidden">
      {/* Subtle top & bottom dark framing gradients matching Free Fire lobby contrast */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#070b12]/90 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#070b12]/95 to-transparent pointer-events-none" />

      {/* TOP BAR: Free Fire Player Banner (Left) + Brand (Center) + Wallet & Audio (Right) */}
      <header className="relative z-10 pointer-events-auto flex items-center justify-between gap-4 px-4 md:px-6 py-3">
        {/* Top-Left Player Profile Banner */}
        <div className="flex items-center gap-3 rounded-lg bg-[#0c121d]/92 border border-amber-500/45 px-3 py-2 shadow-lg">
          <div className="w-10 h-10 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 flex flex-col items-center justify-center text-slate-950 font-display font-extrabold leading-none shrink-0">
            <span className="text-[9px] uppercase">NVL</span>
            <span className="text-base">{profile.level}</span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {editingName ? (
                <input
                  type="text"
                  maxLength={20}
                  autoFocus
                  value={profile.name}
                  onChange={(e) => onNameChange(e.target.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingName(false);
                  }}
                  className="w-36 px-2 py-0.5 rounded bg-[#151e2e] border border-amber-500 text-xs font-bold text-white focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => setEditingName(true)}
                  title="Cambiar nombre de operador"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-white hover:text-amber-300 cursor-pointer truncate max-w-[180px]"
                >
                  <span className="truncate">
                    {profile.clanTag ? `[${profile.clanTag}] ` : ''}
                    {profile.name}
                  </span>
                  <VerifiedBadge name={profile.name} size="sm" />
                  <Pencil className="w-3 h-3 text-slate-400 shrink-0" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <button
                onClick={handleCopyPlayerId}
                title="Copiar ID de Operador"
                className="inline-flex items-center gap-1 font-mono-num text-amber-300 hover:text-amber-200 cursor-pointer"
              >
                <span>ID: {profile.id}</span>
                {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-slate-300">{profile.kills} Bajas</span>
            </div>
          </div>
        </div>

        {/* Top-Center Brand Emblem */}
        <div className="hidden lg:flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <polygon points="32,4 58,18 58,46 32,60 6,46 6,18" fill="#111827" stroke="#F59E0B" strokeWidth="4" />
            <circle cx="32" cy="32" r="9" stroke="#F59E0B" strokeWidth="3.5" />
          </svg>
          <span className="font-display text-lg font-bold tracking-wider text-white">
            BATTLEPLAYERS
          </span>
        </div>

        {/* Top-Right Currency + Audio + Mic + Status */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg bg-[#0c121d]/92 border border-amber-500/40 px-3 py-1.5 font-mono-num text-sm font-bold text-amber-400">
            <Coins className="w-4 h-4" />
            <span>{profile.coins}</span>
          </div>

          <button
            onClick={onToggleMic}
            title={voice.enabled ? 'Micrófono activo' : 'Activar micrófono'}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
              voice.enabled
                ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
                : 'bg-[#0c121d]/92 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {voice.enabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span className="hidden md:inline">{voice.enabled ? 'Mic Listo' : 'Mic'}</span>
          </button>

          <button
            onClick={onToggleMuteAudio}
            title={profile.mutedAudio ? 'Activar sonido' : 'Silenciar sonido'}
            className="p-2 rounded-lg bg-[#0c121d]/92 border border-slate-700 text-slate-200 hover:border-slate-500 cursor-pointer"
          >
            {profile.mutedAudio ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </header>

      {/* MIDDLE AREA: Left Free-Fire Menu Rail + Center Open 3D Stage (or Drawer/Modal) + Right Squad Panel */}
      <div className="relative z-10 flex-1 flex items-stretch justify-between gap-4 px-4 md:px-6 py-2 min-h-0">
        {/* LEFT VERTICAL NAVIGATION RAIL (Always visible, Free Fire style) */}
        <aside className="pointer-events-auto flex flex-col gap-1.5 w-36 sm:w-44 shrink-0 my-auto">
          {[
            { id: 'play' as HubTab, label: 'Lobby', icon: Crosshair },
            { id: 'wardrobe' as HubTab, label: 'Ropa Clásica', icon: Shirt },
            { id: 'shop' as HubTab, label: 'Tienda', icon: ShoppingBag },
            { id: 'friends' as HubTab, label: 'Amigos', icon: UserPlus },
            { id: 'challenges' as HubTab, label: 'Desafíos', icon: Calendar },
            { id: 'clans' as HubTab, label: 'Clanes', icon: Shield },
            { id: 'leaderboard' as HubTab, label: 'Clasificación', icon: Trophy },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-r-lg border-l-4 text-left text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500/95 border-yellow-200 text-slate-950 shadow-lg'
                    : 'bg-[#0b101a]/88 hover:bg-[#131c2e]/95 border-amber-500/40 text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-slate-950' : 'text-amber-400'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'friends' && (pendingInvites.length > 0 || onlineFriends.length > 0) && (
                  <span className={`font-mono-num text-[11px] font-extrabold ${active ? 'text-slate-950' : 'text-emerald-400'}`}>
                    {pendingInvites.length > 0 ? `${pendingInvites.length}!` : onlineFriends.length}
                  </span>
                )}
                {item.id === 'challenges' && canClaimDaily && (
                  <span className={`font-mono-num text-[11px] font-extrabold ${active ? 'text-slate-950' : 'text-amber-400'}`}>
                    +1
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* WARDROBE / SHOP LEFT DRAWER (Center/Right stays 100% open over 3D character!) */}
        {isDrawerOpen && (
          <div className="pointer-events-auto flex-1 flex items-stretch justify-start min-w-0">
            <div className="w-full max-w-md rounded-xl bg-[#0b101a]/94 border border-slate-700/80 p-4 flex flex-col max-h-full overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                    {activeTab === 'wardrobe' ? (
                      <>
                        <Shirt className="w-5 h-5 text-amber-400" />
                        Vestidor · Ropa Clásica
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5 text-amber-400" />
                        Tienda Táctica
                      </>
                    )}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Viste a tu personaje en vivo y gíralo 360° a la derecha
                  </p>
                </div>
                <button
                  onClick={() => onTabChange('play')}
                  title="Volver al Lobby"
                  className="p-1.5 rounded-lg bg-[#161e2e] hover:bg-[#1f2b42] border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Category Tabs */}
              <div className="flex flex-wrap gap-1.5 mb-3 p-1 rounded-lg bg-[#131a29]">
                {WARDROBE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setShopCat(cat.id)}
                    className={`py-1.5 px-2.5 rounded-md text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                      shopCat === cat.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Clothes / Items List */}
              <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
                {wardrobeItems.map((item) => {
                  const owned = profile.ownedItems.includes(item.id);
                  const equipped = profile.loadout[item.category] === item.id;
                  const canAfford = profile.coins >= item.price;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg p-3 border transition-colors ${
                        equipped
                          ? 'bg-amber-500/15 border-amber-400'
                          : 'bg-[#131a29] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-md border border-white/15 shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${item.primaryColor}, ${item.accentColor})`,
                            }}
                          />
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-white truncate">{item.name}</div>
                            <div className="text-[11px] text-slate-400 line-clamp-1">
                              {item.rarity} · {item.description}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => onBuyOrEquipItem(item.id)}
                          disabled={!owned && !canAfford}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
                            equipped
                              ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                              : owned
                              ? 'bg-slate-700 hover:bg-slate-600 text-white'
                              : canAfford
                              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {equipped ? 'Puesto' : owned ? 'Vestir' : `${item.price}`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* RIGHT COMPACT LOBBY PANEL (Only in Lobby view so center 3D character stays unobstructed) */}
        {activeTab === 'play' && (
          <aside className="hidden md:flex flex-col gap-3 w-72 shrink-0 pointer-events-auto my-auto max-h-full">
            {/* Compact Squad / Friends Online */}
            <div className="rounded-xl bg-[#0b101a]/90 border border-slate-800 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  Escuadrón · Amigos ({onlineFriends.length})
                </span>
                <button
                  onClick={() => onTabChange('friends')}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  + Añadir
                </button>
              </div>
              {onlineFriends.length === 0 ? (
                <div className="text-[11px] text-slate-400">
                  {friends.length === 0
                    ? 'Agrega amigos por ID para invitarlos directo a tu sala.'
                    : 'Ningún amigo conectado ahora.'}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-28 overflow-y-auto">
                  {onlineFriends.slice(0, 4).map((f) => {
                    const invited = Boolean(recentlyInvitedIds[f.id]);
                    const joinableRoom = f.status === 'in_match' && f.roomCode && f.roomCode !== 'ARENA-BOTS';
                    return (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#131a29] border border-slate-800 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white flex items-center gap-1 truncate">
                            <span className="truncate">
                              {f.clanTag ? `[${f.clanTag}] ` : ''}
                              {f.name}
                            </span>
                            <VerifiedBadge name={f.name} size="xs" />
                          </div>
                          <div className={`text-[10px] ${f.status === 'in_match' ? 'text-sky-400' : 'text-emerald-400'}`}>
                            {f.status === 'in_match'
                              ? f.roomCode === 'ARENA-BOTS'
                                ? 'En Arena Bots'
                                : `Sala ${f.roomCode}`
                              : 'En línea'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {joinableRoom && f.roomCode && (
                            <button
                              onClick={() => onJoinMultiplayer(f.roomCode!, f.isPrivateRoom)}
                              className="px-2 py-1 rounded bg-sky-500/20 border border-sky-500/40 text-[10px] font-bold text-sky-300 cursor-pointer"
                            >
                              Ir
                            </button>
                          )}
                          <button
                            onClick={() => handleQuickInvite(f.id, { code: privateCode, isPrivate: true })}
                            className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                              invited
                                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            }`}
                          >
                            {invited ? 'Listo' : 'Invitar'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Compact Global Chat & Active Rooms */}
            <div className="rounded-xl bg-[#0b101a]/90 border border-slate-800 p-3.5 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                  Chat Global
                </span>
                <span className="text-[10px] font-mono-num text-emerald-400">
                  {wsConnected ? `${rooms.reduce((acc, r) => acc + r.playerCount, 0)} en sala` : 'Conectando...'}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px] max-h-36 overflow-y-auto mb-2 pr-1">
                {globalChat.slice(-10).map((m) => (
                  <div key={m.id} className="leading-snug">
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                      {m.clanTag ? `[${m.clanTag}] ` : ''}
                      {m.senderName}
                      <VerifiedBadge name={m.senderName} size="xs" />
                      <span>: </span>
                    </span>
                    <span className="text-slate-300">{m.text}</span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleGlobalChatSubmit} className="flex gap-1.5">
                <input
                  type="text"
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  placeholder="Mensaje al lobby..."
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#141c2b] border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </aside>
        )}

        {/* MODAL PANEL FOR FRIENDS / CHALLENGES / CLANS / LEADERBOARD */}
        {isModalOpen && (
          <div className="pointer-events-auto flex-1 flex items-start justify-center overflow-y-auto max-h-full pr-1">
            <div className="w-full max-w-5xl rounded-xl bg-[#0b101a]/96 border border-slate-700/85 p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <h2 className="font-display text-2xl font-bold text-white">
                  {activeTab === 'friends' && 'Amigos e Invitaciones'}
                  {activeTab === 'challenges' && 'Recompensas Diarias y Desafíos'}
                  {activeTab === 'clans' && 'Clanes y Clasificación Global'}
                  {activeTab === 'leaderboard' && 'Clasificación Global en Tiempo Real'}
                </h2>
                <button
                  onClick={() => onTabChange('play')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161e2e] hover:bg-[#222f46] border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Volver al Lobby
                </button>
              </div>

              {/* FRIENDS TAB */}
              {activeTab === 'friends' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-5 space-y-4">
                    <div className="rounded-lg bg-[#131a29] border border-slate-800 p-4">
                      <div className="text-xs text-slate-400 mb-1">Tu ID de Operador</div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono-num text-base font-bold text-amber-400 truncate">
                          {profile.id}
                        </span>
                        <button
                          onClick={handleCopyPlayerId}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1b2437] hover:bg-[#24314b] border border-slate-700 text-xs font-semibold text-white cursor-pointer shrink-0"
                        >
                          {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedId ? 'Copiado' : 'Copiar ID'}
                        </button>
                      </div>
                    </div>

                    <form
                      onSubmit={handleAddFriendSubmit}
                      className="rounded-lg bg-[#131a29] border border-slate-800 p-4 space-y-3"
                    >
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-amber-400" />
                        Añadir Jugador por ID
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={40}
                          value={friendIdInput}
                          onChange={(e) => setFriendIdInput(e.target.value)}
                          placeholder="Ej. op_a1b2c3d4"
                          className="flex-1 px-3 py-2 rounded-lg bg-[#0d131f] border border-slate-700 text-xs text-white font-mono-num focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="submit"
                          disabled={addingFriend || !friendIdInput.trim()}
                          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          {addingFriend ? 'Buscando...' : 'Añadir'}
                        </button>
                      </div>
                      {friendFeedback && (
                        <div className={`text-xs font-medium ${friendFeedback.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                          {friendFeedback.text}
                        </div>
                      )}
                    </form>

                    <div className="rounded-lg bg-[#131a29] border border-slate-800 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">Sala para Invitar</span>
                        <span className="font-mono-num font-bold text-sky-400">{activeInviteRoom}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setInviteTargetMode('private')}
                          className={`py-2 px-2 rounded text-xs font-semibold cursor-pointer ${
                            inviteTargetMode === 'private' ? 'bg-sky-500 text-slate-950' : 'bg-[#0d131f] text-slate-300'
                          }`}
                        >
                          Privada ({privateCode})
                        </button>
                        <button
                          type="button"
                          onClick={() => setInviteTargetMode('public')}
                          className={`py-2 px-2 rounded text-xs font-semibold cursor-pointer ${
                            inviteTargetMode === 'public' ? 'bg-sky-500 text-slate-950' : 'bg-[#0d131f] text-slate-300'
                          }`}
                        >
                          Arena Pública
                        </button>
                      </div>
                      {inviteNotice && (
                        <div className={`text-xs ${inviteNotice.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {inviteNotice.text}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-7 space-y-4">
                    {pendingInvites.length > 0 && (
                      <div className="rounded-lg bg-[#131a29] border border-amber-500/60 p-4 space-y-2">
                        <div className="text-xs font-bold text-amber-300">
                          Invitaciones Recibidas ({pendingInvites.length})
                        </div>
                        {pendingInvites.map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between gap-3 p-2.5 rounded bg-[#0d131f] border border-slate-700">
                            <div className="text-xs">
                              <div className="font-bold text-white flex items-center gap-1">
                                <span>{inv.fromClanTag ? `[${inv.fromClanTag}] ` : ''}{inv.fromName}</span>
                                <VerifiedBadge name={inv.fromName} size="xs" />
                              </div>
                              <div className="text-slate-400">Sala {inv.roomCode}</div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => onAcceptInvite(inv)}
                                className="px-3 py-1.5 rounded bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
                              >
                                Unirse
                              </button>
                              <button
                                onClick={() => onDismissInvite(inv.id)}
                                className="px-2.5 py-1.5 rounded bg-slate-800 text-slate-300 text-xs cursor-pointer"
                              >
                                Rechazar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-lg bg-[#131a29] border border-slate-800 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="text-sm font-bold text-white">
                          Lista de Amigos ({friends.length})
                        </div>
                        <div className="flex gap-1 bg-[#0d131f] p-1 rounded-lg">
                          {[
                            { id: 'all' as const, label: 'Todos' },
                            { id: 'online' as const, label: 'En línea' },
                            { id: 'offline' as const, label: 'Offline' },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => setFriendFilter(opt.id)}
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                                friendFilter === opt.id ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {friends.length === 0 ? (
                        <div className="text-xs text-slate-400 py-6 text-center">
                          Aún no tienes amigos añadidos. Agrega jugadores por ID o desde Clasificación.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {friends
                            .filter((f) =>
                              friendFilter === 'online'
                                ? f.status !== 'offline'
                                : friendFilter === 'offline'
                                ? f.status === 'offline'
                                : true,
                            )
                            .map((f) => {
                              const isOnline = f.status !== 'offline';
                              const invited = Boolean(recentlyInvitedIds[f.id]);
                              const canJoin = f.status === 'in_match' && f.roomCode && f.roomCode !== 'ARENA-BOTS';
                              return (
                                <div
                                  key={f.id}
                                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-[#0d131f] border border-slate-800"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                                      <span
                                        className={`w-2 h-2 rounded-full ${
                                          f.status === 'in_match'
                                            ? 'bg-sky-400'
                                            : f.status === 'online'
                                            ? 'bg-emerald-400'
                                            : 'bg-slate-600'
                                        }`}
                                      />
                                      <span className="truncate">
                                        {f.clanTag ? `[${f.clanTag}] ` : ''}
                                        {f.name}
                                      </span>
                                      <VerifiedBadge name={f.name} size="xs" />
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-mono-num">
                                      {f.id} ·{' '}
                                      {f.status === 'in_match'
                                        ? f.roomCode === 'ARENA-BOTS'
                                          ? 'En Arena Bots'
                                          : `En sala ${f.roomCode}`
                                        : f.status === 'online'
                                        ? 'En línea'
                                        : 'Desconectado'}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {canJoin && f.roomCode && (
                                      <button
                                        onClick={() => onJoinMultiplayer(f.roomCode!, f.isPrivateRoom)}
                                        className="px-2.5 py-1.5 rounded bg-sky-500/20 border border-sky-500/40 text-xs font-semibold text-sky-300 cursor-pointer"
                                      >
                                        Unirse
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleQuickInvite(f.id)}
                                      disabled={!isOnline}
                                      className={`px-2.5 py-1.5 rounded text-xs font-bold ${
                                        !isOnline
                                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                          : invited
                                          ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                                      }`}
                                    >
                                      {invited ? 'Enviada' : 'Invitar'}
                                    </button>
                                    <button
                                      onClick={() => onRemoveFriend(f.id)}
                                      title="Eliminar amigo"
                                      className="p-1.5 rounded bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-300 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CHALLENGES & DAILY REWARDS TAB */}
              {activeTab === 'challenges' && (
                <div className="space-y-5">
                  <div className="rounded-lg bg-[#131a29] border border-slate-800 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                          <Gift className="w-5 h-5 text-amber-400" />
                          Recompensas Diarias (Racha: {profile.dailyStreak} días)
                        </h3>
                      </div>
                      <button
                        onClick={onClaimDaily}
                        disabled={!canClaimDaily}
                        className={`px-4 py-2 rounded-lg font-bold text-xs cursor-pointer ${
                          canClaimDaily
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            : 'bg-slate-800 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {canClaimDaily ? 'Reclamar Recompensa de Hoy' : 'Reclamada Hoy'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                      {DAILY_REWARDS.map((d) => {
                        const claimed = d.day <= profile.dailyStreak;
                        const isNext = d.day === (profile.dailyStreak % 7) + 1 && canClaimDaily;
                        return (
                          <div
                            key={d.day}
                            className={`rounded-lg p-2.5 border text-center ${
                              claimed
                                ? 'bg-emerald-950/40 border-emerald-600/50'
                                : isNext
                                ? 'bg-amber-500/15 border-amber-400'
                                : 'bg-[#0d131f] border-slate-800'
                            }`}
                          >
                            <div className="text-[11px] font-semibold text-slate-300">{d.label}</div>
                            <div className="font-mono-num text-base font-bold text-amber-400">+{d.coins}</div>
                            <div className="text-[10px] text-slate-400">
                              {d.bonusItemId ? '+ Visor Recon' : 'Monedas'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {WEEKLY_CHALLENGES.map((ch) => {
                      const prog = Math.min(ch.target, profile.challengeProgress[ch.metric] || 0);
                      const pct = Math.round((prog / ch.target) * 100);
                      const claimed = profile.claimedChallenges.includes(ch.id);
                      const ready = prog >= ch.target && !claimed;
                      return (
                        <div key={ch.id} className="rounded-lg bg-[#131a29] border border-slate-800 p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="text-sm font-bold text-white">{ch.title}</div>
                              <div className="text-xs text-slate-400">{ch.description}</div>
                            </div>
                            <div className="text-right font-mono-num text-xs shrink-0">
                              <div className="text-amber-400 font-bold">+{ch.rewardCoins}</div>
                              <div className="text-sky-400">+{ch.rewardXp} XP</div>
                            </div>
                          </div>
                          <div className="flex justify-between text-xs text-slate-300 mb-1 font-mono-num">
                            <span>{prog} / {ch.target}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full h-2 rounded bg-slate-800 overflow-hidden mb-3">
                            <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                          </div>
                          <button
                            onClick={() => onClaimChallenge(ch.id)}
                            disabled={!ready}
                            className={`w-full py-2 rounded-lg text-xs font-bold ${
                              claimed
                                ? 'bg-emerald-950/60 border border-emerald-600/40 text-emerald-300'
                                : ready
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            {claimed ? 'Reclamado' : ready ? 'Reclamar Recompensa' : 'En Progreso'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CLANS TAB */}
              {activeTab === 'clans' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-5">
                    {myClan ? (
                      <div className="rounded-lg bg-[#131a29] border border-slate-800 p-5">
                        <div className="text-xs text-slate-400 mb-1">Tu Clan Actual</div>
                        <div className="flex items-center gap-2.5 mb-2">
                          <span
                            className="px-2 py-0.5 rounded font-mono-num font-bold text-xs text-slate-950"
                            style={{ backgroundColor: myClan.color }}
                          >
                            [{myClan.tag}]
                          </span>
                          <h3 className="font-display text-xl font-bold text-white">{myClan.name}</h3>
                        </div>
                        <p className="text-xs text-slate-300 mb-4">{myClan.description}</p>
                        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                          <div className="rounded bg-[#0d131f] p-2">
                            <div className="text-[10px] text-slate-400">Puntos</div>
                            <div className="font-mono-num font-bold text-amber-400">{myClan.totalPoints}</div>
                          </div>
                          <div className="rounded bg-[#0d131f] p-2">
                            <div className="text-[10px] text-slate-400">Victorias</div>
                            <div className="font-mono-num font-bold text-white">{myClan.totalWins}</div>
                          </div>
                          <div className="rounded bg-[#0d131f] p-2">
                            <div className="text-[10px] text-slate-400">Miembros</div>
                            <div className="font-mono-num font-bold text-sky-400">{myClan.membersCount}</div>
                          </div>
                        </div>
                        <button
                          onClick={onLeaveClan}
                          className="w-full py-2 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-700/50 text-xs font-semibold text-red-200 cursor-pointer"
                        >
                          Abandonar Clan
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleCreateClanSubmit} className="rounded-lg bg-[#131a29] border border-slate-800 p-5 space-y-3">
                        <div className="flex items-center gap-2 font-display text-lg font-bold text-white">
                          <Plus className="w-4 h-4 text-amber-400" />
                          Fundar Clan
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            maxLength={4}
                            value={clanTag}
                            onChange={(e) => setClanTag(e.target.value.toUpperCase())}
                            placeholder="TAG"
                            className="px-3 py-2 rounded bg-[#0d131f] border border-slate-700 text-xs text-white font-mono-num uppercase focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            maxLength={28}
                            value={clanName}
                            onChange={(e) => setClanName(e.target.value)}
                            placeholder="Nombre del Clan"
                            className="col-span-2 px-3 py-2 rounded bg-[#0d131f] border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <input
                          type="text"
                          maxLength={80}
                          value={clanDesc}
                          onChange={(e) => setClanDesc(e.target.value)}
                          placeholder="Descripción del escuadrón..."
                          className="w-full px-3 py-2 rounded bg-[#0d131f] border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Color</span>
                          <div className="flex gap-2">
                            {['#f59e0b', '#38bdf8', '#10b981', '#ef4444', '#a855f7'].map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setClanColor(c)}
                                className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                                  clanColor === c ? 'border-white scale-110' : 'border-transparent'
                                }`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                        {clanError && <div className="text-xs text-red-400">{clanError}</div>}
                        <button
                          type="submit"
                          className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          Crear Clan
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="lg:col-span-7 rounded-lg bg-[#131a29] border border-slate-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-white">Ranking Global de Clanes</span>
                      <Crown className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {clans.map((clan, idx) => {
                        const isMine = clan.id === profile.clanId;
                        return (
                          <div
                            key={clan.id}
                            className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                              isMine ? 'bg-amber-500/10 border-amber-500/60' : 'bg-[#0d131f] border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="font-mono-num text-xs font-bold text-slate-400">#{idx + 1}</span>
                              <span
                                className="px-2 py-0.5 rounded font-mono-num text-[11px] font-bold text-slate-950"
                                style={{ backgroundColor: clan.color }}
                              >
                                [{clan.tag}]
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">{clan.name}</div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                                  <span>Líder: {clan.leaderName}</span>
                                  <VerifiedBadge name={clan.leaderName} size="xs" />
                                  <span>· {clan.membersCount} miembros</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right font-mono-num text-xs">
                                <div className="font-bold text-amber-400">{clan.totalPoints} pts</div>
                                <div className="text-[10px] text-slate-400">{clan.totalWins} vic.</div>
                              </div>
                              {!isMine && (
                                <button
                                  onClick={() => onJoinClan(clan.id)}
                                  className="px-2.5 py-1 rounded bg-[#1d273b] hover:bg-[#273550] text-xs font-semibold text-white cursor-pointer"
                                >
                                  Unirse
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* GLOBAL REAL-TIME LEADERBOARD TAB */}
              {activeTab === 'leaderboard' && (
                <div className="overflow-x-auto max-h-[60vh]">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs text-slate-400">
                        <th className="py-2 px-2">Rango</th>
                        <th className="py-2 px-2">Operador</th>
                        <th className="py-2 px-2 text-right">Bajas</th>
                        <th className="py-2 px-2 text-right">Muertes</th>
                        <th className="py-2 px-2 text-right">K/D</th>
                        <th className="py-2 px-2 text-right">Victorias</th>
                        <th className="py-2 px-2 text-right">Rating</th>
                        <th className="py-2 px-2 text-right">Amigos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((row, idx) => {
                        const isSelf = row.id === profile.id;
                        const isFriend = friends.some((f) => f.id === row.id);
                        const kd = row.deaths > 0 ? (row.kills / row.deaths).toFixed(2) : row.kills.toFixed(2);
                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-slate-800/60 ${
                              isSelf ? 'bg-amber-500/10 text-amber-300 font-semibold' : 'text-slate-200'
                            }`}
                          >
                            <td className="py-2 px-2 font-mono-num">#{idx + 1}</td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1.5">
                                {row.clanTag ? (
                                  <span className="font-mono-num text-amber-400">[{row.clanTag}]</span>
                                ) : null}
                                <span>{row.name}</span>
                                <VerifiedBadge name={row.name} size="xs" />
                              </div>
                              <div className="font-mono-num text-[10px] text-slate-500">{row.id}</div>
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num">{row.kills}</td>
                            <td className="py-2 px-2 text-right font-mono-num">{row.deaths}</td>
                            <td className="py-2 px-2 text-right font-mono-num">{kd}</td>
                            <td className="py-2 px-2 text-right font-mono-num">{row.wins}</td>
                            <td className="py-2 px-2 text-right font-mono-num font-bold text-amber-400">
                              {row.rating}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {isSelf ? (
                                <span className="text-xs text-slate-400">Tú</span>
                              ) : isFriend ? (
                                <span className="text-xs font-semibold text-emerald-400">Amigo</span>
                              ) : (
                                <button
                                  onClick={() => onAddFriend(row.id)}
                                  className="px-2.5 py-1 rounded bg-[#1a2232] hover:bg-[#26334a] border border-slate-700 text-xs font-semibold text-white cursor-pointer"
                                >
                                  Añadir
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM FREE-FIRE ACTION BAR: Quick Shortcuts (Left) + Spin Hint (Center) + Mode Selector & INICIAR (Right) */}
      <footer className="relative z-10 pointer-events-auto flex flex-wrap items-end justify-between gap-3 px-4 md:px-6 pb-4 pt-1">
        {/* Bottom-Left Quick Wardrobe / Weapons / Social Strip */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setShopCat('armor');
              onTabChange('wardrobe');
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#0c121d]/92 hover:bg-[#172135] border border-slate-700 text-xs font-bold text-white cursor-pointer"
          >
            <Shirt className="w-4 h-4 text-amber-400" />
            <span>Ropa Clásica</span>
          </button>

          <button
            onClick={() => {
              setShopCat('weaponSkin');
              onTabChange('shop');
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#0c121d]/92 hover:bg-[#172135] border border-slate-700 text-xs font-bold text-white cursor-pointer"
          >
            <Crosshair className="w-4 h-4 text-sky-400" />
            <span>Armas</span>
          </button>

          <button
            onClick={() => onTabChange('friends')}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#0c121d]/92 hover:bg-[#172135] border border-slate-700 text-xs font-bold text-white cursor-pointer"
          >
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Amigos</span>
          </button>
        </div>

        {/* Bottom-Center 360 Spin Hint */}
        {!isModalOpen && (
          <div className="hidden xl:flex items-center gap-1.5 text-[11px] font-medium text-slate-300 pb-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Arrastra al personaje para girarlo 360°</span>
          </div>
        )}

        {/* Bottom-Right Mode Selector + Prominent Gold INICIAR Button */}
        <div className="flex flex-wrap items-end gap-2.5 ml-auto">
          <div className="rounded-lg bg-[#0c121d]/94 border border-slate-700/90 p-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              {[
                { id: 'bots' as LaunchMode, label: 'Arena Bots' },
                { id: 'private' as LaunchMode, label: 'Sala Privada' },
                { id: 'public' as LaunchMode, label: `Pública (${rooms.find((r) => r.code === 'PUBLIC-1')?.playerCount ?? 0})` },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setLaunchMode(m.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                    launchMode === m.id
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-[#151e2e] text-slate-300 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {launchMode === 'bots' && (
              <div className="flex items-center gap-1">
                {(['recluta', 'veterano', 'elite'] as BotDifficulty[]).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setDifficulty(lvl)}
                    className={`flex-1 py-1 px-2 rounded text-[10px] font-bold capitalize cursor-pointer ${
                      difficulty === lvl
                        ? 'bg-amber-500/25 border border-amber-400 text-amber-300'
                        : 'bg-[#151e2e] text-slate-400 hover:text-white'
                    }`}
                  >
                    {lvl === 'elite' ? 'Élite' : lvl}
                  </button>
                ))}
              </div>
            )}

            {launchMode === 'private' && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyCode}
                  title="Copiar código de tu sala privada"
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#151e2e] border border-slate-700 font-mono-num text-[10px] font-bold text-amber-300 cursor-pointer"
                >
                  <span>{privateCode}</span>
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
                <input
                  type="text"
                  maxLength={12}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="O código..."
                  className="w-24 px-2 py-1 rounded bg-[#151e2e] border border-slate-700 text-[10px] text-white font-mono-num focus:outline-none focus:border-sky-500"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleLaunchMatch}
            className="flex items-center justify-center gap-2 px-7 py-4 rounded-lg bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-display font-extrabold text-lg tracking-wider shadow-xl cursor-pointer transition-transform active:scale-95"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>INICIAR</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
