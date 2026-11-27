import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { voiceChat, type VoiceStatus } from './audio/voiceChat';
import { GameHUD } from './components/GameHUD';
import { MainMenuHub, type HubTab } from './components/MainMenuHub';
import { MatchSummaryModal } from './components/MatchSummaryModal';
import { TitleScreen } from './components/TitleScreen';
import { DAILY_REWARDS, SHOP_ITEMS, WEEKLY_CHALLENGES } from './data/catalog';
import { BattlePlayersEngine, type BotDifficulty, type HudSnapshot } from './game/ThreeEngine';
import { mpClient, type RoomSummary, type ServerEvent } from './services/multiplayerClient';
import { calcLevel, getTodayKey, loadProfile, saveProfile } from './services/profileStorage';
import type {
  ChatMessage,
  ClanInfo,
  LeaderboardEntry,
  MatchSummary,
  PlayerProfile,
} from './types/game';

type ScreenState = 'title' | 'hub' | 'playing';

const INITIAL_HUD: HudSnapshot = {
  hp: 100,
  ammo: 30,
  maxAmmo: 30,
  reserveAmmo: 150,
  reloading: false,
  reloadProgress: 0,
  stamina: 100,
  kills: 0,
  deaths: 0,
  headshots: 0,
  score: 0,
  timeRemaining: 180,
  killTarget: 15,
  hitmarker: 'none',
  damageFlash: 0,
  crosshairSpread: 0,
  pointerLocked: false,
  alive: true,
  respawnIn: 0,
  killFeed: [],
  scoreboard: [],
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BattlePlayersEngine | null>(null);

  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const [screen, setScreen] = useState<ScreenState>('title');
  const [hubTab, setHubTab] = useState<HubTab>('play');
  const [matchMode, setMatchMode] = useState<'offline' | 'multiplayer'>('offline');
  const [lastDifficulty, setLastDifficulty] = useState<BotDifficulty>('veterano');
  const [roomCode, setRoomCode] = useState('OFFLINE');
  const [paused, setPaused] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [webglLost, setWebglLost] = useState(false);

  // Real-time Server State
  const [wsConnected, setWsConnected] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [clans, setClans] = useState<ClanInfo[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [globalChat, setGlobalChat] = useState<ChatMessage[]>([]);
  const [roomChat, setRoomChat] = useState<ChatMessage[]>([]);
  const [voice, setVoice] = useState<VoiceStatus>(() => voiceChat.getStatus());

  const updateProfile = useCallback((updater: (prev: PlayerProfile) => PlayerProfile) => {
    setProfile((prev) => {
      const next = updater(prev);
      saveProfile(next);
      return next;
    });
  }, []);

  // Sync audio mute setting
  useEffect(() => {
    soundEngine.setMuted(profile.mutedAudio);
  }, [profile.mutedAudio]);

  // Sync engine identity & loadout without recreating WebGL
  useEffect(() => {
    engineRef.current?.setIdentity(
      profile.id,
      profile.name,
      profile.clanTag,
      profile.loadout,
      profile.sensitivity,
    );
  }, [profile.id, profile.name, profile.clanTag, profile.loadout, profile.sensitivity]);

  // Sync engine view mode when navigating Title / Hub / Shop / Playing
  useEffect(() => {
    if (!engineRef.current) return;
    if (screen === 'playing') {
      engineRef.current.setViewMode('playing');
    } else if (screen === 'hub' && hubTab === 'shop') {
      engineRef.current.setViewMode('shop');
    } else {
      engineRef.current.setViewMode('title');
    }
  }, [screen, hubTab]);

  const handleMatchEnd = useCallback(
    async (rawSummary: MatchSummary) => {
      const cur = profileRef.current;
      const unlocked: string[] = [];
      const checkAch = (id: string, cond: boolean) => {
        if (cond && !cur.achievements.includes(id)) unlocked.push(id);
      };

      checkAch('first_blood', rawSummary.kills >= 1);
      checkAch('sharpshooter', rawSummary.headshots >= 3);
      checkAch('champion', rawSummary.won);
      checkAch('unstoppable', rawSummary.kills >= 10);
      checkAch('squad_player', rawSummary.mode === 'multiplayer');
      checkAch('clan_warrior', Boolean(cur.clanId));

      let clanPointsEarned = rawSummary.clanPointsEarned;

      try {
        const res = await fetch('/api/match/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: cur.id,
            name: cur.name,
            clanId: cur.clanId,
            clanTag: cur.clanTag,
            kills: rawSummary.kills,
            deaths: rawSummary.deaths,
            won: rawSummary.won,
            mode: rawSummary.mode,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.clanPointsEarned === 'number') clanPointsEarned = data.clanPointsEarned;
          if (Array.isArray(data.leaderboard)) setLeaderboard(data.leaderboard);
          if (Array.isArray(data.clans)) setClans(data.clans);
        }
      } catch {
        // Offline / server unreachable graceful fallback
      }

      updateProfile((prev) => {
        const nextXp = prev.xp + rawSummary.xpEarned;
        const prog = { ...prev.challengeProgress };
        prog.kills = (prog.kills || 0) + rawSummary.kills;
        prog.headshots = (prog.headshots || 0) + rawSummary.headshots;
        prog.matches = (prog.matches || 0) + 1;
        if (rawSummary.won) prog.wins = (prog.wins || 0) + 1;
        if (rawSummary.mode === 'multiplayer') {
          prog.multiplayerMatches = (prog.multiplayerMatches || 0) + 1;
        }

        return {
          ...prev,
          coins: prev.coins + rawSummary.coinsEarned,
          xp: nextXp,
          level: calcLevel(nextXp),
          kills: prev.kills + rawSummary.kills,
          deaths: prev.deaths + rawSummary.deaths,
          wins: prev.wins + (rawSummary.won ? 1 : 0),
          matches: prev.matches + 1,
          headshots: prev.headshots + rawSummary.headshots,
          challengeProgress: prog,
          achievements: [...prev.achievements, ...unlocked],
        };
      });

      soundEngine.playReward();
      setMatchSummary({
        ...rawSummary,
        clanPointsEarned,
        unlockedAchievements: unlocked,
      });
    },
    [updateProfile],
  );

  // Initialize Three.js Engine once on mount
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new BattlePlayersEngine(mount, profileRef.current.loadout, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onMatchEnd: (summary) => handleMatchEnd(summary),
      onPauseToggle: () => {
        setPaused((prev) => {
          const next = !prev;
          engineRef.current?.setPaused(next);
          return next;
        });
      },
      onToggleChat: () => {
        setChatOpen((prev) => {
          const next = !prev;
          engineRef.current?.setChatOpen(next);
          return next;
        });
      },
      onToggleMic: () => {
        voiceChat.toggle();
      },
      onToggleScoreboard: (visible) => setScoreboardOpen(visible),
      onMultiplayerMove: (x, y, z, yaw, pitch) => {
        mpClient.sendMove(x, y, z, yaw, pitch);
      },
      onMultiplayerShoot: (origin, hitPoint) => {
        mpClient.sendShoot(origin, hitPoint);
      },
      onMultiplayerHit: (targetId, headshot) => {
        mpClient.sendHit(targetId, headshot);
      },
    });

    engineRef.current = engine;
    engine.setIdentity(
      profileRef.current.id,
      profileRef.current.name,
      profileRef.current.clanTag,
      profileRef.current.loadout,
      profileRef.current.sensitivity,
    );

    const canvas = mount.querySelector('canvas');
    const onLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const onRestored = () => setWebglLost(false);
    canvas?.addEventListener('webglcontextlost', onLost);
    canvas?.addEventListener('webglcontextrestored', onRestored);

    return () => {
      canvas?.removeEventListener('webglcontextlost', onLost);
      canvas?.removeEventListener('webglcontextrestored', onRestored);
      engine.dispose();
      engineRef.current = null;
    };
  }, [handleMatchEnd]);

  // Connect WebSocket & Voice Chat
  useEffect(() => {
    voiceChat.setCallbacks(
      (speaking) => mpClient.sendSpeaking(speaking),
      (chunk) => mpClient.sendVoiceAudio(chunk),
    );
    const unsubVoice = voiceChat.subscribe(setVoice);

    // Initial REST fetch so data shows immediately even before WS connects
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.leaderboard)) setLeaderboard(data.leaderboard);
        if (Array.isArray(data.clans)) setClans(data.clans);
        if (Array.isArray(data.rooms)) setRooms(data.rooms);
      })
      .catch(() => {});

    mpClient.connect();
    const unsubMp = mpClient.subscribe((ev: ServerEvent) => {
      switch (ev.type) {
        case 'connected':
          setWsConnected(true);
          break;
        case 'disconnected':
          setWsConnected(false);
          break;
        case 'init:sync':
          setLeaderboard(ev.leaderboard);
          setClans(ev.clans);
          setRooms(ev.rooms);
          setGlobalChat(ev.globalChat);
          break;
        case 'leaderboard:sync':
          setLeaderboard(ev.leaderboard);
          setClans(ev.clans);
          break;
        case 'clans:sync':
          setClans(ev.clans);
          break;
        case 'rooms:sync':
          setRooms(ev.rooms);
          break;
        case 'room:joined':
          setMatchMode('multiplayer');
          setRoomCode(ev.room.code);
          setRoomChat(ev.chat);
          setMatchSummary(null);
          setPaused(false);
          setChatOpen(false);
          setScreen('playing');
          engineRef.current?.startMultiplayerMatch(ev.room.code, ev.room.players);
          break;
        case 'player:joined':
          engineRef.current?.upsertRemotePlayer(ev.player);
          break;
        case 'player:left':
          engineRef.current?.removeRemotePlayer(ev.playerId);
          break;
        case 'player:moved':
          engineRef.current?.updateRemotePlayerTransform(ev.playerId, ev.x, ev.y, ev.z, ev.yaw, ev.pitch);
          break;
        case 'player:fired':
          engineRef.current?.handleRemoteFired(ev.origin, ev.hitPoint, ev.tracer);
          break;
        case 'player:damaged':
          engineRef.current?.handleRemoteDamaged(ev.targetId, ev.hp, ev.headshot);
          break;
        case 'player:killed':
          engineRef.current?.handleRemoteKilled(
            ev.killerId,
            ev.killerName,
            ev.victimId,
            ev.victimName,
            ev.headshot,
          );
          break;
        case 'player:respawned':
          engineRef.current?.handleRemoteRespawned(ev.playerId, ev.x, ev.y, ev.z);
          break;
        case 'match:ended':
          engineRef.current?.handleRemoteMatchEnded();
          break;
        case 'chat:message':
          if (ev.message.channel === 'global') {
            setGlobalChat((prev) => [...prev.slice(-39), ev.message]);
          } else {
            setRoomChat((prev) => [...prev.slice(-39), ev.message]);
          }
          break;
        case 'voice:speaking':
          engineRef.current?.setRemoteSpeaking(ev.playerId, ev.speaking);
          break;
        case 'voice:audio':
          voiceChat.playRemoteAudio(ev.data);
          break;
      }
    });

    return () => {
      unsubVoice();
      unsubMp();
      mpClient.disconnect();
      voiceChat.stop();
    };
  }, []);

  const startOffline = (difficulty: BotDifficulty) => {
    setLastDifficulty(difficulty);
    setMatchMode('offline');
    setRoomCode('OFFLINE');
    setMatchSummary(null);
    setPaused(false);
    setChatOpen(false);
    setRoomChat([
      {
        id: `sys_${Date.now()}`,
        senderId: 'system',
        senderName: 'ARENA',
        clanTag: '',
        text: `Partida Offline (${difficulty}) iniciada. ¡Elimina a los 5 bots tácticos!`,
        timestamp: Date.now(),
        channel: 'system',
      },
    ]);
    setScreen('playing');
    engineRef.current?.startOfflineMatch(difficulty);
  };

  const joinMultiplayer = (code: string, isPrivate: boolean) => {
    mpClient.joinRoom({
      roomCode: code,
      isPrivate,
      playerId: profile.id,
      name: profile.name,
      clanTag: profile.clanTag,
      loadout: profile.loadout,
    });
  };

  const exitToMenu = () => {
    if (matchMode === 'multiplayer') {
      mpClient.leaveRoom();
    }
    setPaused(false);
    setChatOpen(false);
    setMatchSummary(null);
    engineRef.current?.setPaused(false);
    engineRef.current?.exitPointerLock();
    setScreen('hub');
  };

  const handleSendMatchChat = (text: string) => {
    if (matchMode === 'multiplayer') {
      mpClient.sendChat('room', profile.name, profile.clanTag, text);
    } else {
      setRoomChat((prev) => [
        ...prev.slice(-20),
        {
          id: `loc_${Date.now()}`,
          senderId: profile.id,
          senderName: profile.name,
          clanTag: profile.clanTag,
          text,
          timestamp: Date.now(),
          channel: 'room',
        },
      ]);
    }
  };

  const handleBuyOrEquipItem = (itemId: string) => {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return;
    if (profile.ownedItems.includes(itemId)) {
      updateProfile((prev) => ({
        ...prev,
        loadout: { ...prev.loadout, [item.category]: item.id },
      }));
      soundEngine.playHitmarker(false);
      return;
    }
    if (profile.coins < item.price) return;
    updateProfile((prev) => ({
      ...prev,
      coins: prev.coins - item.price,
      ownedItems: [...prev.ownedItems, item.id],
      loadout: { ...prev.loadout, [item.category]: item.id },
    }));
    soundEngine.playReward();
  };

  const todayKey = getTodayKey();
  const canClaimDaily = profile.lastDailyClaimDate !== todayKey;

  const handleClaimDaily = () => {
    if (!canClaimDaily) return;
    const nextDay = (profile.dailyStreak % 7) + 1;
    const reward = DAILY_REWARDS.find((d) => d.day === nextDay) || DAILY_REWARDS[0];
    updateProfile((prev) => ({
      ...prev,
      coins: prev.coins + reward.coins,
      dailyStreak: nextDay,
      lastDailyClaimDate: todayKey,
      ownedItems:
        reward.bonusItemId && !prev.ownedItems.includes(reward.bonusItemId)
          ? [...prev.ownedItems, reward.bonusItemId]
          : prev.ownedItems,
    }));
    soundEngine.playReward();
  };

  const handleClaimChallenge = (challengeId: string) => {
    const ch = WEEKLY_CHALLENGES.find((c) => c.id === challengeId);
    if (!ch || profile.claimedChallenges.includes(challengeId)) return;
    const prog = profile.challengeProgress[ch.metric] || 0;
    if (prog < ch.target) return;

    updateProfile((prev) => {
      const nextXp = prev.xp + ch.rewardXp;
      return {
        ...prev,
        coins: prev.coins + ch.rewardCoins,
        xp: nextXp,
        level: calcLevel(nextXp),
        claimedChallenges: [...prev.claimedChallenges, ch.id],
      };
    });
    soundEngine.playReward();
  };

  const handleCreateClan = async (data: {
    tag: string;
    name: string;
    description: string;
    color: string;
  }): Promise<string | null> => {
    try {
      const res = await fetch('/api/clans/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, leaderName: profile.name }),
      });
      const json = await res.json();
      if (!res.ok) return json.error || 'Error al crear clan.';
      if (Array.isArray(json.clans)) setClans(json.clans);
      if (json.clan) {
        updateProfile((prev) => ({
          ...prev,
          clanId: json.clan.id,
          clanTag: json.clan.tag,
        }));
      }
      soundEngine.playReward();
      return null;
    } catch {
      return 'No se pudo conectar con el servidor.';
    }
  };

  const handleJoinClan = async (clanId: string) => {
    try {
      const res = await fetch('/api/clans/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clanId, previousClanId: profile.clanId }),
      });
      const json = await res.json();
      if (res.ok && json.clan) {
        if (Array.isArray(json.clans)) setClans(json.clans);
        updateProfile((prev) => ({
          ...prev,
          clanId: json.clan.id,
          clanTag: json.clan.tag,
        }));
        soundEngine.playHitmarker(true);
      }
    } catch {
      // ignore
    }
  };

  const handleLeaveClan = async () => {
    if (!profile.clanId) return;
    try {
      const res = await fetch('/api/clans/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clanId: profile.clanId }),
      });
      const json = await res.json();
      if (Array.isArray(json.clans)) setClans(json.clans);
    } catch {
      // ignore
    }
    updateProfile((prev) => ({ ...prev, clanId: null, clanTag: '' }));
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0d12]">
      {/* Isolated 3D WebGL Canvas Mount */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />

      {webglLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0d12] text-center p-6">
          <div className="max-w-md rounded-xl bg-[#111722] border border-slate-700 p-6">
            <h2 className="font-display text-xl font-bold text-white mb-2">
              Contexto Gráfico 3D Pausado
            </h2>
            <p className="text-sm text-slate-400">
              Restaurando el motor WebGL de BATTLEPLAYERS...
            </p>
          </div>
        </div>
      )}

      {/* Title Welcome Screen */}
      {screen === 'title' && (
        <TitleScreen
          playerName={profile.name}
          onNameChange={(name) => updateProfile((p) => ({ ...p, name }))}
          onEnterMenu={() => setScreen('hub')}
          onQuickPlayOffline={() => startOffline('veterano')}
        />
      )}

      {/* Tactical Menu Hub */}
      {screen === 'hub' && (
        <MainMenuHub
          activeTab={hubTab}
          onTabChange={setHubTab}
          profile={profile}
          wsConnected={wsConnected}
          leaderboard={leaderboard}
          clans={clans}
          rooms={rooms}
          globalChat={globalChat}
          voice={voice}
          canClaimDaily={canClaimDaily}
          onNameChange={(name) => updateProfile((p) => ({ ...p, name }))}
          onToggleMuteAudio={() => updateProfile((p) => ({ ...p, mutedAudio: !p.mutedAudio }))}
          onToggleMic={() => voiceChat.toggle()}
          onStartOffline={startOffline}
          onJoinMultiplayer={joinMultiplayer}
          onSendGlobalChat={(text) => mpClient.sendChat('global', profile.name, profile.clanTag, text)}
          onBuyOrEquipItem={handleBuyOrEquipItem}
          onClaimDaily={handleClaimDaily}
          onClaimChallenge={handleClaimChallenge}
          onCreateClan={handleCreateClan}
          onJoinClan={handleJoinClan}
          onLeaveClan={handleLeaveClan}
        />
      )}

      {/* In-Game HUD */}
      {screen === 'playing' && !matchSummary && (
        <GameHUD
          hud={hud}
          mode={matchMode}
          roomCode={roomCode}
          paused={paused}
          chatOpen={chatOpen}
          scoreboardOpen={scoreboardOpen}
          chatMessages={roomChat}
          voice={voice}
          sensitivity={profile.sensitivity}
          mutedAudio={profile.mutedAudio}
          onRequestPointerLock={() => engineRef.current?.requestPointerLock()}
          onResume={() => {
            setPaused((p) => {
              const next = !p;
              engineRef.current?.setPaused(next);
              if (!next) engineRef.current?.requestPointerLock();
              return next;
            });
          }}
          onExitMatch={exitToMenu}
          onSendChat={handleSendMatchChat}
          onCloseChat={() => {
            setChatOpen(false);
            engineRef.current?.setChatOpen(false);
            engineRef.current?.requestPointerLock();
          }}
          onToggleMic={() => voiceChat.toggle()}
          onSensitivityChange={(val) => updateProfile((p) => ({ ...p, sensitivity: val }))}
          onToggleMuteAudio={() => updateProfile((p) => ({ ...p, mutedAudio: !p.mutedAudio }))}
        />
      )}

      {/* Post-Match Summary + Social Sharing */}
      {matchSummary && (
        <MatchSummaryModal
          summary={matchSummary}
          playerName={profile.name}
          clanTag={profile.clanTag}
          onPlayAgain={() => {
            if (matchMode === 'offline') {
              startOffline(lastDifficulty);
            } else {
              joinMultiplayer(roomCode, roomCode !== 'PUBLIC-1');
            }
          }}
          onBackToMenu={exitToMenu}
        />
      )}
    </div>
  );
}
