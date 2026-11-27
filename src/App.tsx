import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Maximize2, RotateCw, UserPlus, WifiOff, X } from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { voiceChat, type VoiceStatus } from './audio/voiceChat';
import { GameHUD } from './components/GameHUD';
import { InstallDownloadModal } from './components/InstallDownloadModal';
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
  FriendInfo,
  LeaderboardEntry,
  MatchSummary,
  PlayerProfile,
  RoomInvite,
} from './types/game';

type ScreenState = 'title' | 'hub' | 'playing';

const INITIAL_HUD: HudSnapshot = {
  hp: 100,
  ammo: 30,
  maxAmmo: 30,
  reserveAmmo: 150,
  grenades: 2,
  maxGrenades: 2,
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
  lowHealthIntensity: 0,
  grenadeShockIntensity: 0,
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
  const [matchMode, setMatchMode] = useState<'solo' | 'multiplayer'>('solo');
  const [lastDifficulty, setLastDifficulty] = useState<BotDifficulty>('veterano');
  const [roomCode, setRoomCode] = useState('ARENA-BOTS');
  const [paused, setPaused] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [webglLost, setWebglLost] = useState(false);

  // Internet Connectivity & Android Horizontal Fullscreen Detection
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [wsConnected, setWsConnected] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 0 && window.innerWidth <= 1024);
  });
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false,
  );

  // Real-time Server State
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [clans, setClans] = useState<ClanInfo[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [globalChat, setGlobalChat] = useState<ChatMessage[]>([]);
  const [roomChat, setRoomChat] = useState<ChatMessage[]>([]);
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [pendingInvites, setPendingInvites] = useState<RoomInvite[]>([]);
  const [inviteNotice, setInviteNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [voice, setVoice] = useState<VoiceStatus>(() => voiceChat.getStatus());

  const updateProfile = useCallback((updater: (prev: PlayerProfile) => PlayerProfile) => {
    setProfile((prev) => {
      const next = updater(prev);
      saveProfile(next);
      return next;
    });
  }, []);

  const requestFullscreenLandscape = useCallback(async () => {
    try {
      const docEl = document.documentElement;
      if (!document.fullscreenElement && docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      }
      const orientation = window.screen?.orientation as
        | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
        | undefined;
      if (orientation?.lock) {
        await orientation.lock('landscape');
      }
    } catch {
      // Some browsers restrict orientation.lock outside standalone PWA; fullscreen still engages
    }
  }, []);

  // Track online/offline & orientation changes
  useEffect(() => {
    const onOnline = () => {
      setBrowserOnline(true);
      mpClient.connect();
    };
    const onOffline = () => {
      setBrowserOnline(false);
    };
    const onResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
      const touch =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 0 && window.innerWidth <= 1024);
      setIsTouchDevice(touch);
      engineRef.current?.setTouchDevice(touch);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Pause engine automatically if internet drops
  useEffect(() => {
    if (!browserOnline && screen === 'playing') {
      engineRef.current?.setPaused(true);
    } else if (browserOnline && screen === 'playing' && !paused) {
      engineRef.current?.setPaused(false);
    }
  }, [browserOnline, screen, paused]);

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

  // Sync engine view mode
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
        // Server sync retry
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
      onMultiplayerGrenadeThrow: (origin, velocity) => {
        mpClient.sendGrenadeThrow(origin, velocity);
      },
      onMultiplayerGrenadeDamage: (targetId, damage) => {
        mpClient.sendGrenadeDamage(targetId, damage);
      },
    });

    engineRef.current = engine;
    engine.setTouchDevice(isTouchDevice);
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

    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.leaderboard)) setLeaderboard(data.leaderboard);
        if (Array.isArray(data.clans)) setClans(data.clans);
        if (Array.isArray(data.rooms)) setRooms(data.rooms);
      })
      .catch(() => {});

    fetch(`/api/friends/${encodeURIComponent(profileRef.current.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.friends)) setFriends(data.friends);
      })
      .catch(() => {});

    mpClient.connect();
    mpClient.registerPresence({
      playerId: profileRef.current.id,
      name: profileRef.current.name,
      clanTag: profileRef.current.clanTag,
      status: 'online',
      roomCode: null,
      isPrivateRoom: false,
    });

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
        case 'friends:sync':
          setFriends(ev.friends);
          break;
        case 'invite:received':
          soundEngine.playReward();
          setPendingInvites((prev) => {
            if (prev.some((i) => i.id === ev.invite.id)) return prev;
            return [ev.invite, ...prev].slice(0, 6);
          });
          break;
        case 'invite:sent':
          setInviteNotice({
            type: 'success',
            text: `Invitación enviada a ${ev.toName} para la sala ${ev.roomCode}.`,
          });
          setTimeout(() => setInviteNotice(null), 4000);
          break;
        case 'invite:error':
          setInviteNotice({ type: 'error', text: ev.message });
          setTimeout(() => setInviteNotice(null), 4000);
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
        case 'grenade:thrown':
          engineRef.current?.handleRemoteGrenadeThrown(ev.ownerId, ev.ownerName, ev.origin, ev.velocity);
          break;
        case 'player:damaged':
          engineRef.current?.handleRemoteDamaged(ev.targetId, ev.hp, ev.headshot, ev.explosive);
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

  // Keep server presence synchronized when profile identity or match state changes
  useEffect(() => {
    const inMatch = screen === 'playing';
    mpClient.registerPresence({
      playerId: profile.id,
      name: profile.name,
      clanTag: profile.clanTag,
      status: inMatch ? 'in_match' : 'online',
      roomCode: inMatch ? roomCode : null,
      isPrivateRoom: inMatch && matchMode === 'multiplayer' && roomCode !== 'PUBLIC-1',
    });
  }, [profile.id, profile.name, profile.clanTag, screen, roomCode, matchMode]);

  const startSoloBots = (difficulty: BotDifficulty) => {
    if (!browserOnline) return;
    if (isTouchDevice) requestFullscreenLandscape();
    setLastDifficulty(difficulty);
    setMatchMode('solo');
    setRoomCode('ARENA-BOTS');
    setMatchSummary(null);
    setPaused(false);
    setChatOpen(false);
    setRoomChat([
      {
        id: `sys_${Date.now()}`,
        senderId: 'system',
        senderName: 'ARENA',
        clanTag: '',
        text: `Arena con Bots (${difficulty}) iniciada. ¡Los bots también combaten entre sí y usan granadas!`,
        timestamp: Date.now(),
        channel: 'system',
      },
    ]);
    setScreen('playing');
    engineRef.current?.startSoloBotMatch(difficulty);
  };

  const joinMultiplayer = (code: string, isPrivate: boolean) => {
    if (!browserOnline) return;
    if (isTouchDevice) requestFullscreenLandscape();
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
    } else {
      mpClient.updatePresenceStatus('online', null, false);
    }
    setPaused(false);
    setChatOpen(false);
    setMatchSummary(null);
    engineRef.current?.setPaused(false);
    engineRef.current?.exitPointerLock();
    setScreen('hub');
  };

  const handleAddFriend = async (targetId: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await fetch('/api/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: profile.id,
          targetId,
          playerName: profile.name,
          clanTag: profile.clanTag,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        return { ok: false, message: json.error || 'No se pudo añadir al jugador.' };
      }
      if (Array.isArray(json.friends)) setFriends(json.friends);
      soundEngine.playReward();
      return {
        ok: true,
        message: `${json.added?.name || targetId} añadido a tu lista de amigos.`,
      };
    } catch {
      return { ok: false, message: 'Error de conexión con el servidor.' };
    }
  };

  const handleRemoveFriend = async (targetId: string) => {
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: profile.id, targetId }),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.friends)) {
        setFriends(json.friends);
      }
    } catch {
      // ignore
    }
  };

  const handleSendInvite = (toPlayerId: string, targetRoomCode: string, isPrivate: boolean) => {
    mpClient.sendRoomInvite({
      toPlayerId,
      roomCode: targetRoomCode,
      isPrivate,
      fromName: profile.name,
      fromClanTag: profile.clanTag,
    });
  };

  const handleAcceptInvite = (invite: RoomInvite) => {
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
    setPaused(false);
    setChatOpen(false);
    setMatchSummary(null);
    engineRef.current?.setPaused(false);
    joinMultiplayer(invite.roomCode, invite.isPrivate);
  };

  const handleDismissInvite = (inviteId: string) => {
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
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
          isTouchDevice={isTouchDevice}
          onNameChange={(name) => updateProfile((p) => ({ ...p, name }))}
          onEnterMenu={() => {
            if (isTouchDevice) requestFullscreenLandscape();
            setScreen('hub');
          }}
          onQuickPlayBots={() => startSoloBots('veterano')}
          onRequestFullscreenLandscape={requestFullscreenLandscape}
          onOpenInstallModal={() => setInstallModalOpen(true)}
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
          friends={friends}
          pendingInvites={pendingInvites}
          inviteNotice={inviteNotice}
          voice={voice}
          canClaimDaily={canClaimDaily}
          onNameChange={(name) => updateProfile((p) => ({ ...p, name }))}
          onToggleMuteAudio={() => updateProfile((p) => ({ ...p, mutedAudio: !p.mutedAudio }))}
          onToggleMic={() => voiceChat.toggle()}
          onStartOffline={startSoloBots}
          onJoinMultiplayer={joinMultiplayer}
          onSendGlobalChat={(text) => mpClient.sendChat('global', profile.name, profile.clanTag, text)}
          onBuyOrEquipItem={handleBuyOrEquipItem}
          onClaimDaily={handleClaimDaily}
          onClaimChallenge={handleClaimChallenge}
          onCreateClan={handleCreateClan}
          onJoinClan={handleJoinClan}
          onLeaveClan={handleLeaveClan}
          onAddFriend={handleAddFriend}
          onRemoveFriend={handleRemoveFriend}
          onSendInvite={handleSendInvite}
          onAcceptInvite={handleAcceptInvite}
          onDismissInvite={handleDismissInvite}
          onOpenInstallModal={() => setInstallModalOpen(true)}
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
          isTouchDevice={isTouchDevice}
          onRequestPointerLock={() => engineRef.current?.requestPointerLock()}
          onRequestFullscreenLandscape={requestFullscreenLandscape}
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
          onToggleChat={() => {
            setChatOpen((prev) => {
              const next = !prev;
              engineRef.current?.setChatOpen(next);
              return next;
            });
          }}
          onToggleMic={() => voiceChat.toggle()}
          onSensitivityChange={(val) => updateProfile((p) => ({ ...p, sensitivity: val }))}
          onToggleMuteAudio={() => updateProfile((p) => ({ ...p, mutedAudio: !p.mutedAudio }))}
          onTouchMove={(x, y) => engineRef.current?.setTouchMove(x, y)}
          onTouchLook={(dx, dy) => engineRef.current?.applyTouchLook(dx, dy)}
          onTouchFiring={(firing) => engineRef.current?.setTouchFiring(firing)}
          onTouchJump={() => engineRef.current?.triggerJump()}
          onTouchReload={() => engineRef.current?.triggerReload()}
          onTouchGrenade={() => engineRef.current?.triggerGrenade()}
        />
      )}

      {/* Post-Match Summary + Social Sharing */}
      {matchSummary && (
        <MatchSummaryModal
          summary={matchSummary}
          playerName={profile.name}
          clanTag={profile.clanTag}
          onPlayAgain={() => {
            if (matchMode === 'solo') {
              startSoloBots(lastDifficulty);
            } else {
              joinMultiplayer(roomCode, roomCode !== 'PUBLIC-1');
            }
          }}
          onBackToMenu={exitToMenu}
        />
      )}

      {/* Android Portrait-to-Horizontal Fullscreen Prompt */}
      {isTouchDevice && isPortrait && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080b10]/96 p-6 text-center">
          <div className="max-w-sm rounded-xl bg-[#111722] border border-amber-500/50 p-6">
            <RotateCw className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h2 className="font-display text-2xl font-bold text-white mb-2">
              Modo Horizontal Requerido
            </h2>
            <p className="text-sm text-slate-300 mb-5">
              Para jugar BATTLEPLAYERS en Android a pantalla completa, gira tu teléfono en horizontal.
            </p>
            <button
              onClick={requestFullscreenLandscape}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
              Activar Pantalla Completa Horizontal
            </button>
          </div>
        </div>
      )}

      {/* Floating Real-Time Room Invite Toast */}
      {pendingInvites.length > 0 && browserOnline && (
        <div className="fixed bottom-4 right-4 z-40 max-w-sm w-[calc(100%-2rem)] rounded-xl bg-[#0e1420]/96 border border-amber-500/70 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <UserPlus className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-300">Invitación a Sala de Juego</div>
                <div className="text-sm font-semibold text-white truncate">
                  {pendingInvites[0].fromClanTag ? `[${pendingInvites[0].fromClanTag}] ` : ''}
                  {pendingInvites[0].fromName}
                </div>
                <div className="text-xs text-slate-300">
                  Sala <span className="font-mono-num font-bold text-amber-400">{pendingInvites[0].roomCode}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleDismissInvite(pendingInvites[0].id)}
              title="Cerrar invitación"
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => handleAcceptInvite(pendingInvites[0])}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Unirse a la Sala
            </button>
            <button
              onClick={() => handleDismissInvite(pendingInvites[0].id)}
              className="px-3 py-2 rounded-lg bg-[#1a2232] hover:bg-[#253149] border border-slate-700 text-xs text-slate-300 cursor-pointer"
            >
              Luego
            </button>
          </div>
        </div>
      )}

      {/* Install & Windows (.EXE) / Android (.APK) Kit Modal */}
      <InstallDownloadModal open={installModalOpen} onClose={() => setInstallModalOpen(false)} />

      {/* Online-Required Internet Connection Guard */}
      {!browserOnline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070a0f]/95 p-6 text-center">
          <div className="max-w-md rounded-xl bg-[#111722] border border-red-500/60 p-6">
            <WifiOff className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h2 className="font-display text-2xl font-bold text-white mb-2">
              Conexión a Internet Requerida
            </h2>
            <p className="text-sm text-slate-300">
              BATTLEPLAYERS funciona exclusivamente con Internet para sincronizar partidas, bots, chat de voz, clanes y clasificación global. Reconectando...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
