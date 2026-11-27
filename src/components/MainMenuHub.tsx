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
  Play,
  Plus,
  Send,
  Shield,
  ShoppingBag,
  Trophy,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DAILY_REWARDS, SHOP_ITEMS, WEEKLY_CHALLENGES } from '../data/catalog';
import type { BotDifficulty } from '../game/ThreeEngine';
import type { RoomSummary } from '../services/multiplayerClient';
import type { VoiceStatus } from '../audio/voiceChat';
import type {
  AccessoryCategory,
  ChatMessage,
  ClanInfo,
  LeaderboardEntry,
  PlayerProfile,
} from '../types/game';

export type HubTab = 'play' | 'shop' | 'challenges' | 'clans' | 'leaderboard';

interface MainMenuHubProps {
  activeTab: HubTab;
  onTabChange: (tab: HubTab) => void;
  profile: PlayerProfile;
  wsConnected: boolean;
  leaderboard: LeaderboardEntry[];
  clans: ClanInfo[];
  rooms: RoomSummary[];
  globalChat: ChatMessage[];
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
}

const SHOP_CATEGORIES: Array<{ id: AccessoryCategory; label: string }> = [
  { id: 'helmet', label: 'Cascos' },
  { id: 'armor', label: 'Armaduras' },
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
}) => {
  const [difficulty, setDifficulty] = useState<BotDifficulty>('veterano');
  const [joinCode, setJoinCode] = useState('');
  const [privateCode, setPrivateCode] = useState(() => `BP-${Math.floor(1000 + Math.random() * 8999)}`);
  const [copiedCode, setCopiedCode] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [shopCat, setShopCat] = useState<AccessoryCategory>('helmet');

  // Create Clan form
  const [clanTag, setClanTag] = useState('');
  const [clanName, setClanName] = useState('');
  const [clanDesc, setClanDesc] = useState('');
  const [clanColor, setClanColor] = useState('#f59e0b');
  const [clanError, setClanError] = useState<string | null>(null);

  const myClan = clans.find((c) => c.id === profile.clanId) || null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(privateCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
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

  return (
    <div className="fixed inset-0 z-20 flex flex-col pointer-events-none">
      {/* Top 3-Zone Navigation Bar */}
      <header className="pointer-events-auto flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0a0e16]/95 border-b border-slate-800">
        {/* Zone 1: Brand wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <svg width="28" height="28" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <polygon points="32,4 58,18 58,46 32,60 6,46 6,18" fill="#111827" stroke="#F59E0B" strokeWidth="4" />
            <circle cx="32" cy="32" r="9" stroke="#F59E0B" strokeWidth="3.5" />
          </svg>
          <span className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            BATTLEPLAYERS
          </span>
        </div>

        {/* Zone 2: Concise single-line navigation tabs */}
        <nav className="flex items-center gap-6 overflow-x-auto">
          {[
            { id: 'play' as HubTab, label: 'Jugar', icon: Crosshair },
            { id: 'shop' as HubTab, label: 'Tienda', icon: ShoppingBag },
            { id: 'challenges' as HubTab, label: 'Desafíos', icon: Calendar },
            { id: 'clans' as HubTab, label: 'Clanes', icon: Shield },
            { id: 'leaderboard' as HubTab, label: 'Clasificación', icon: Trophy },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex items-center gap-2 py-1.5 text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active ? 'text-amber-400' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.id === 'challenges' && canClaimDaily && (
                  <span className="text-[11px] font-bold text-emerald-400">(1)</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Player wallet & primary audio toggle */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-300">
            <span className="font-mono-num font-semibold text-white">Nvl {profile.level}</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 font-mono-num font-bold text-amber-400">
              <Coins className="w-3.5 h-3.5" />
              {profile.coins}
            </span>
          </div>
          <button
            onClick={onToggleMuteAudio}
            title={profile.mutedAudio ? 'Activar sonido' : 'Silenciar sonido'}
            className="p-2 rounded-lg bg-[#151c28] border border-slate-700 text-slate-200 hover:border-slate-500 cursor-pointer shrink-0"
          >
            {profile.mutedAudio ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </header>

      {/* Main Hub Body */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        {activeTab === 'play' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 pointer-events-auto">
            {/* Left 8 cols: Game Modes */}
            <div className="lg:col-span-8 space-y-6">
              {/* Player Callsign Quick Bar */}
              <div className="rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Operador Windows PC · {profile.clanTag ? `Clan [${profile.clanTag}]` : 'Sin Clan'}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <input
                      type="text"
                      maxLength={20}
                      value={profile.name}
                      onChange={(e) => onNameChange(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-[#141b27] border border-slate-700 text-white font-semibold text-sm focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-xs text-slate-400 font-mono-num">
                      {profile.kills} Bajas · {profile.wins} Victorias
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onToggleMic}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                      voice.enabled
                        ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
                        : 'bg-[#141b27] border-slate-700 text-slate-200 hover:border-slate-500'
                    }`}
                  >
                    {voice.enabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    {voice.enabled ? 'Micrófono Listo' : 'Probar Micrófono'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Offline Bots Card */}
                <div className="rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-display text-xl font-bold text-white">Modo Offline (Bots)</h2>
                      <Crosshair className="w-5 h-5 text-amber-400" />
                    </div>
                    <p className="text-sm text-slate-400 mb-5">
                      Combate sin conexión contra 5 bots tácticos en el mapa Campo de Pruebas 3D. Ideal para entrenar puntería y ganar recompensas.
                    </p>

                    <div className="mb-5">
                      <label className="block text-xs font-medium text-slate-300 mb-2">
                        Dificultad de los Bots
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['recluta', 'veterano', 'elite'] as BotDifficulty[]).map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => setDifficulty(lvl)}
                            className={`py-2 px-3 rounded-lg text-xs font-semibold capitalize border cursor-pointer transition-colors ${
                              difficulty === lvl
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-[#141b27] text-slate-300 border-slate-700 hover:border-slate-500'
                            }`}
                          >
                            {lvl === 'elite' ? 'Élite' : lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onStartOffline(difficulty)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Iniciar Partida Offline
                  </button>
                </div>

                {/* Multiplayer Friends Card */}
                <div className="rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-display text-xl font-bold text-white">Multijugador en Línea</h2>
                      <Users className="w-5 h-5 text-sky-400" />
                    </div>
                    <p className="text-sm text-slate-400 mb-4">
                      Compite en tiempo real con amigos mediante salas privadas, chat integrado y voz por micrófono.
                    </p>

                    {/* Private Room Creator */}
                    <div className="rounded-lg bg-[#131926] border border-slate-800 p-3.5 mb-3">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                        <span>Crear Sala Privada para Amigos</span>
                        <span className="font-mono-num font-bold text-amber-400">{privateCode}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCopyCode}
                          className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#1b2436] hover:bg-[#243047] border border-slate-700 text-xs text-slate-200 cursor-pointer whitespace-nowrap"
                        >
                          {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedCode ? 'Copiado' : 'Copiar Código'}
                        </button>
                        <button
                          onClick={() => onJoinMultiplayer(privateCode, true)}
                          className="flex-1 py-2 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Abrir Sala Privada
                        </button>
                      </div>
                    </div>

                    {/* Join Friend Code */}
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        maxLength={12}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="Código de amigo (ej. BP-4821)"
                        className="flex-1 px-3 py-2 rounded-lg bg-[#141b27] border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                      <button
                        onClick={() => joinCode.trim() && onJoinMultiplayer(joinCode.trim(), true)}
                        className="px-4 py-2 rounded-lg bg-[#1a2232] hover:bg-[#232f45] border border-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                      >
                        Unirse
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => onJoinMultiplayer('PUBLIC-1', false)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-display font-bold text-sm cursor-pointer transition-colors"
                  >
                    <Users className="w-4 h-4" />
                    Entrar a Arena Pública ({rooms.find((r) => r.code === 'PUBLIC-1')?.playerCount ?? 0} en línea)
                  </button>
                </div>
              </div>
            </div>

            {/* Right 4 cols: Active Rooms & Global Lobby Chat */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              <div className="rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white">Salas Activas</span>
                  <span className="text-xs text-slate-400">
                    {wsConnected ? 'Conectado' : 'Reconectando...'}
                  </span>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {rooms.map((r) => (
                    <div
                      key={r.code}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#131926] border border-slate-800 text-xs"
                    >
                      <div>
                        <div className="font-mono-num font-bold text-white">{r.code}</div>
                        <div className="text-[11px] text-slate-400">{r.hostName}</div>
                      </div>
                      <button
                        onClick={() => onJoinMultiplayer(r.code, r.isPrivate)}
                        className="px-3 py-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-semibold cursor-pointer"
                      >
                        {r.playerCount}/{r.maxPlayers} · Entrar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Global Lobby Chat */}
              <div className="rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-4 flex-1 flex flex-col min-h-[260px]">
                <div className="flex items-center gap-2 text-xs font-semibold text-white mb-3">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  Chat Global de Jugadores
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 text-xs mb-3 max-h-56 pr-1">
                  {globalChat.map((m) => (
                    <div key={m.id} className="leading-relaxed">
                      <span className="font-semibold text-amber-300">
                        {m.clanTag ? `[${m.clanTag}] ` : ''}
                        {m.senderName}:{' '}
                      </span>
                      <span className="text-slate-300">{m.text}</span>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleGlobalChatSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="Escribe en el chat global..."
                    className="flex-1 px-3 py-2 rounded-lg bg-[#141b27] border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* SHOP TAB: Left side drawer so center/right 3D avatar showcase stays completely clear! */}
        {activeTab === 'shop' && (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            <div className="lg:col-span-5 rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-5 pointer-events-auto flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">Tienda de Accesorios</h2>
                  <p className="text-xs text-slate-400">
                    Arrastra el avatar 3D a la derecha para inspeccionarlo en 360°
                  </p>
                </div>
                <div className="flex items-center gap-1.5 font-mono-num text-base font-bold text-amber-400">
                  <Coins className="w-4 h-4" />
                  {profile.coins}
                </div>
              </div>

              {/* Category Tabs */}
              <div className="flex flex-wrap gap-1.5 mb-4 p-1 rounded-lg bg-[#131926]">
                {SHOP_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setShopCat(cat.id)}
                    className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                      shopCat === cat.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Items List */}
              <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                {SHOP_ITEMS.filter((i) => i.category === shopCat).map((item) => {
                  const owned = profile.ownedItems.includes(item.id);
                  const equipped = profile.loadout[item.category] === item.id;
                  const canAfford = profile.coins >= item.price;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg p-3.5 border transition-colors ${
                        equipped
                          ? 'bg-amber-500/10 border-amber-500/60'
                          : 'bg-[#131926] border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className="w-10 h-10 rounded-lg border border-white/15 shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${item.primaryColor}, ${item.accentColor})`,
                            }}
                          />
                          <div>
                            <div className="text-sm font-semibold text-white">{item.name}</div>
                            <div className="text-[11px] text-slate-400">
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
                          {equipped ? 'Equipado' : owned ? 'Equipar' : `${item.price} Monedas`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 7 cols stay open over the live 3D avatar showcase */}
            <div className="lg:col-span-7 flex flex-col justify-end items-end pointer-events-none">
              <div className="rounded-lg bg-[#0b0f17]/85 border border-slate-800 px-4 py-2 text-xs text-slate-300">
                Vista previa 3D en tiempo real · Arrastra con el ratón para rotar tu operador
              </div>
            </div>
          </div>
        )}

        {/* CHALLENGES & DAILY REWARDS TAB */}
        {activeTab === 'challenges' && (
          <div className="max-w-5xl mx-auto space-y-6 pointer-events-auto">
            {/* Daily Rewards */}
            <div className="rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                    <Gift className="w-6 h-6 text-amber-400" />
                    Recompensas Diarias
                  </h2>
                  <p className="text-xs text-slate-400">
                    Racha actual: {profile.dailyStreak} días · Conéctate cada día para desbloquear el Visor Élite en el Día 7.
                  </p>
                </div>
                <button
                  onClick={onClaimDaily}
                  disabled={!canClaimDaily}
                  className={`px-5 py-2.5 rounded-lg font-display font-bold text-sm cursor-pointer ${
                    canClaimDaily
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {canClaimDaily ? 'Reclamar Recompensa de Hoy' : 'Recompensa de Hoy Reclamada'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                {DAILY_REWARDS.map((d) => {
                  const claimed = d.day <= profile.dailyStreak;
                  const isNext = d.day === (profile.dailyStreak % 7) + 1 && canClaimDaily;
                  return (
                    <div
                      key={d.day}
                      className={`rounded-lg p-3 border text-center ${
                        claimed
                          ? 'bg-emerald-950/40 border-emerald-600/50'
                          : isNext
                          ? 'bg-amber-500/15 border-amber-400'
                          : 'bg-[#131926] border-slate-800'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-300 mb-1">{d.label}</div>
                      <div className="font-mono-num text-lg font-bold text-amber-400">+{d.coins}</div>
                      <div className="text-[11px] text-slate-400">
                        {d.bonusItemId ? '+ Visor Recon' : 'Monedas'}
                      </div>
                      <div className="mt-2 text-[11px] font-semibold">
                        {claimed ? (
                          <span className="text-emerald-400">Obtenido</span>
                        ) : isNext ? (
                          <span className="text-amber-300">Disponible</span>
                        ) : (
                          <span className="text-slate-500">Bloqueado</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Weekly Challenges */}
            <div className="rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-6">
              <h2 className="font-display text-2xl font-bold text-white mb-1">Desafíos Semanales</h2>
              <p className="text-xs text-slate-400 mb-5">
                Completa objetivos en partidas Offline o Multijugador para ganar BattleCoins y XP.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {WEEKLY_CHALLENGES.map((ch) => {
                  const prog = Math.min(ch.target, profile.challengeProgress[ch.metric] || 0);
                  const pct = Math.round((prog / ch.target) * 100);
                  const claimed = profile.claimedChallenges.includes(ch.id);
                  const ready = prog >= ch.target && !claimed;

                  return (
                    <div key={ch.id} className="rounded-lg bg-[#131926] border border-slate-800 p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="text-sm font-bold text-white">{ch.title}</div>
                          <div className="text-xs text-slate-400">{ch.description}</div>
                        </div>
                        <div className="text-right font-mono-num text-xs shrink-0">
                          <div className="text-amber-400 font-bold">+{ch.rewardCoins} Monedas</div>
                          <div className="text-sky-400">+{ch.rewardXp} XP</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
                        <span className="font-mono-num">
                          {prog} / {ch.target}
                        </span>
                        <span className="font-mono-num">{pct}%</span>
                      </div>
                      <div className="w-full h-2 rounded-sm bg-slate-800 overflow-hidden mb-3">
                        <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>

                      <button
                        onClick={() => onClaimChallenge(ch.id)}
                        disabled={!ready}
                        className={`w-full py-2 rounded-lg text-xs font-bold cursor-pointer ${
                          claimed
                            ? 'bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 cursor-default'
                            : ready
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
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
          </div>
        )}

        {/* CLANS TAB */}
        {activeTab === 'clans' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 pointer-events-auto">
            {/* Left 5 cols: My Clan or Create Clan */}
            <div className="lg:col-span-5 space-y-5">
              {myClan ? (
                <div className="rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-6">
                  <div className="text-xs text-slate-400 mb-1">Tu Clan Actual</div>
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="px-2.5 py-1 rounded font-mono-num font-bold text-sm text-slate-950"
                      style={{ backgroundColor: myClan.color }}
                    >
                      [{myClan.tag}]
                    </span>
                    <h2 className="font-display text-2xl font-bold text-white">{myClan.name}</h2>
                  </div>
                  <p className="text-sm text-slate-300 mb-4">{myClan.description}</p>
                  <div className="grid grid-cols-3 gap-2 mb-5 text-center">
                    <div className="rounded bg-[#131926] p-2.5">
                      <div className="text-[11px] text-slate-400">Puntos</div>
                      <div className="font-mono-num font-bold text-amber-400">{myClan.totalPoints}</div>
                    </div>
                    <div className="rounded bg-[#131926] p-2.5">
                      <div className="text-[11px] text-slate-400">Victorias</div>
                      <div className="font-mono-num font-bold text-white">{myClan.totalWins}</div>
                    </div>
                    <div className="rounded bg-[#131926] p-2.5">
                      <div className="text-[11px] text-slate-400">Miembros</div>
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
                <form
                  onSubmit={handleCreateClanSubmit}
                  className="rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-6 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-amber-400" />
                    <h2 className="font-display text-xl font-bold text-white">Crear Nuevo Clan</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Etiqueta (2-4)</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={clanTag}
                        onChange={(e) => setClanTag(e.target.value.toUpperCase())}
                        placeholder="PRO"
                        className="w-full px-3 py-2 rounded-lg bg-[#141b27] border border-slate-700 text-sm text-white font-mono-num uppercase focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Nombre del Clan</label>
                      <input
                        type="text"
                        maxLength={28}
                        value={clanName}
                        onChange={(e) => setClanName(e.target.value)}
                        placeholder="Fuerza Táctica"
                        className="w-full px-3 py-2 rounded-lg bg-[#141b27] border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Descripción</label>
                    <input
                      type="text"
                      maxLength={80}
                      value={clanDesc}
                      onChange={(e) => setClanDesc(e.target.value)}
                      placeholder="Escuadrón competitivo de BATTLEPLAYERS..."
                      className="w-full px-3 py-2 rounded-lg bg-[#141b27] border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Color de Emblema</span>
                    <div className="flex gap-2">
                      {['#f59e0b', '#38bdf8', '#10b981', '#ef4444', '#a855f7'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setClanColor(c)}
                          className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
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
                    className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
                  >
                    Fundar Clan
                  </button>
                </form>
              )}
            </div>

            {/* Right 7 cols: Real-Time Global Clan Leaderboard */}
            <div className="lg:col-span-7 rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">
                    Clasificación Global de Clanes
                  </h2>
                  <p className="text-xs text-slate-400">
                    Actualización en tiempo real tras cada partida de los miembros
                  </p>
                </div>
                <Crown className="w-6 h-6 text-amber-400" />
              </div>

              <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                {clans.map((clan, idx) => {
                  const isMine = clan.id === profile.clanId;
                  return (
                    <div
                      key={clan.id}
                      className={`flex items-center justify-between gap-4 p-3.5 rounded-lg border ${
                        isMine
                          ? 'bg-amber-500/10 border-amber-500/60'
                          : 'bg-[#131926] border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono-num text-sm font-bold text-slate-400 w-6">
                          #{idx + 1}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded font-mono-num text-xs font-bold text-slate-950 shrink-0"
                          style={{ backgroundColor: clan.color }}
                        >
                          [{clan.tag}]
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-white text-sm truncate">{clan.name}</div>
                          <div className="text-[11px] text-slate-400 truncate">
                            Líder: {clan.leaderName} · {clan.membersCount} miembros
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right font-mono-num">
                          <div className="text-sm font-bold text-amber-400">{clan.totalPoints} pts</div>
                          <div className="text-[11px] text-slate-400">{clan.totalWins} victorias</div>
                        </div>
                        {!isMine && (
                          <button
                            onClick={() => onJoinClan(clan.id)}
                            className="px-3 py-1.5 rounded-lg bg-[#1d273b] hover:bg-[#273550] border border-slate-700 text-xs font-semibold text-white cursor-pointer"
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
          <div className="max-w-5xl mx-auto rounded-xl bg-[#0b0f17]/95 border border-slate-800 p-6 pointer-events-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">
                  Clasificación Global en Tiempo Real
                </h2>
                <p className="text-xs text-slate-400">
                  Sincronizada en vivo por servidor WebSocket con todos los jugadores de BATTLEPLAYERS PC
                </p>
              </div>
              <div className="text-xs font-medium text-emerald-400">
                {wsConnected ? 'Sincronización en vivo activa' : 'Modo local'}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="py-2.5 px-2">Rango</th>
                    <th className="py-2.5 px-2">Operador</th>
                    <th className="py-2.5 px-2 text-right">Bajas</th>
                    <th className="py-2.5 px-2 text-right">Muertes</th>
                    <th className="py-2.5 px-2 text-right">K/D</th>
                    <th className="py-2.5 px-2 text-right">Victorias</th>
                    <th className="py-2.5 px-2 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => {
                    const isSelf = row.id === profile.id;
                    const kd = row.deaths > 0 ? (row.kills / row.deaths).toFixed(2) : row.kills.toFixed(2);
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-slate-800/60 ${
                          isSelf ? 'bg-amber-500/10 text-amber-300 font-semibold' : 'text-slate-200'
                        }`}
                      >
                        <td className="py-2.5 px-2 font-mono-num">#{idx + 1}</td>
                        <td className="py-2.5 px-2">
                          {row.clanTag ? (
                            <span className="font-mono-num text-amber-400 mr-1.5">[{row.clanTag}]</span>
                          ) : null}
                          {row.name}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono-num">{row.kills}</td>
                        <td className="py-2.5 px-2 text-right font-mono-num">{row.deaths}</td>
                        <td className="py-2.5 px-2 text-right font-mono-num">{kd}</td>
                        <td className="py-2.5 px-2 text-right font-mono-num">{row.wins}</td>
                        <td className="py-2.5 px-2 text-right font-mono-num font-bold text-amber-400">
                          {row.rating}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
