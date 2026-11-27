import React, { useEffect, useRef, useState } from 'react';
import {
  Bomb,
  Crosshair,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCw,
  Send,
  Shield,
  Skull,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { VoiceStatus } from '../audio/voiceChat';
import type { HudSnapshot } from '../game/ThreeEngine';
import type { ChatMessage } from '../types/game';

interface GameHUDProps {
  hud: HudSnapshot;
  mode: 'solo' | 'multiplayer';
  roomCode: string;
  paused: boolean;
  chatOpen: boolean;
  scoreboardOpen: boolean;
  chatMessages: ChatMessage[];
  voice: VoiceStatus;
  sensitivity: number;
  mutedAudio: boolean;
  isTouchDevice: boolean;
  onRequestPointerLock: () => void;
  onRequestFullscreenLandscape: () => void;
  onResume: () => void;
  onExitMatch: () => void;
  onSendChat: (text: string) => void;
  onCloseChat: () => void;
  onToggleChat: () => void;
  onToggleMic: () => void;
  onSensitivityChange: (val: number) => void;
  onToggleMuteAudio: () => void;
  onTouchMove: (x: number, y: number) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onTouchFiring: (firing: boolean) => void;
  onTouchJump: () => void;
  onTouchReload: () => void;
  onTouchGrenade: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  mode,
  roomCode,
  paused,
  chatOpen,
  scoreboardOpen,
  chatMessages,
  voice,
  sensitivity,
  mutedAudio,
  isTouchDevice,
  onRequestPointerLock,
  onRequestFullscreenLandscape,
  onResume,
  onExitMatch,
  onSendChat,
  onCloseChat,
  onToggleChat,
  onToggleMic,
  onSensitivityChange,
  onToggleMuteAudio,
  onTouchMove,
  onTouchLook,
  onTouchFiring,
  onTouchJump,
  onTouchReload,
  onTouchGrenade,
}) => {
  const [chatText, setChatText] = useState('');
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Touch virtual joystick & aim tracking
  const joyTouchId = useRef<number | null>(null);
  const joyCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const lookTouchId = useRef<number | null>(null);
  const lookLast = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => chatInputRef.current?.focus(), 20);
    }
  }, [chatOpen]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatText.trim()) {
      onSendChat(chatText.trim());
      setChatText('');
    }
    onCloseChat();
  };

  const handleJoyStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (joyTouchId.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    joyTouchId.current = touch.identifier;
    joyCenter.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateJoyFromTouch(touch.clientX, touch.clientY);
  };

  const handleJoyMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (joyTouchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchId.current) {
        updateJoyFromTouch(t.clientX, t.clientY);
        break;
      }
    }
  };

  const handleJoyEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (joyTouchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId.current) {
        joyTouchId.current = null;
        setJoyKnob({ x: 0, y: 0 });
        onTouchMove(0, 0);
        break;
      }
    }
  };

  const updateJoyFromTouch = (cx: number, cy: number) => {
    const maxRadius = 42;
    const dx = cx - joyCenter.current.x;
    const dy = cy - joyCenter.current.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(maxRadius, dist);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    setJoyKnob({ x: kx, y: ky });
    onTouchMove(kx / maxRadius, -ky / maxRadius);
  };

  const handleLookStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (lookTouchId.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    lookTouchId.current = touch.identifier;
    lookLast.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleLookMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (lookTouchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === lookTouchId.current) {
        const dx = t.clientX - lookLast.current.x;
        const dy = t.clientY - lookLast.current.y;
        lookLast.current = { x: t.clientX, y: t.clientY };
        onTouchLook(dx, dy);
        break;
      }
    }
  };

  const handleLookEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (lookTouchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId.current) {
        lookTouchId.current = null;
        break;
      }
    }
  };

  const mins = Math.floor(hud.timeRemaining / 60);
  const secs = hud.timeRemaining % 60;
  const formattedTime = `${mins}:${String(secs).padStart(2, '0')}`;
  const spread = 6 + hud.crosshairSpread;

  return (
    <div className="fixed inset-0 z-30 pointer-events-none select-none overflow-hidden">
      {/* Subtle HUD Damage / Low-Health Vignette Reinforcement */}
      {(hud.damageFlash > 0.03 || hud.lowHealthIntensity > 0.05) && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle, transparent 52%, rgba(200, 24, 28, ${Math.min(
              0.68,
              Math.max(hud.damageFlash * 0.55, hud.lowHealthIntensity * 0.42),
            )}) 100%)`,
          }}
        />
      )}

      {/* Right-half Touch Look Zone for Android Landscape */}
      {isTouchDevice && hud.alive && !paused && !chatOpen && (
        <div
          onTouchStart={handleLookStart}
          onTouchMove={handleLookMove}
          onTouchEnd={handleLookEnd}
          onTouchCancel={handleLookEnd}
          className="absolute inset-y-0 right-0 w-1/2 pointer-events-auto touch-none"
        />
      )}

      {/* Top-Center Match Telemetry */}
      <div className="absolute top-2.5 md:top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 md:gap-5 px-4 md:px-5 py-1.5 md:py-2 rounded-lg bg-[#0b0f17]/85 border border-slate-700/70">
        <div className="text-center">
          <div className="text-[10px] md:text-[11px] text-slate-400">Bajas</div>
          <div className="font-mono-num text-base md:text-lg font-bold text-amber-400">
            {hud.kills} / {hud.killTarget}
          </div>
        </div>
        <div className="h-6 w-px bg-slate-700" />
        <div className="text-center">
          <div className="text-[10px] md:text-[11px] text-slate-400">Tiempo</div>
          <div className="font-mono-num text-base md:text-lg font-bold text-white">{formattedTime}</div>
        </div>
        <div className="h-6 w-px bg-slate-700" />
        <div className="text-center">
          <div className="text-[10px] md:text-[11px] text-slate-400">Sala</div>
          <div className="font-mono-num text-xs md:text-sm font-semibold text-sky-400">
            {mode === 'solo' ? 'SOLO BOTS' : roomCode}
          </div>
        </div>
      </div>

      {/* Top-Right Mic, Chat Toggle, Fullscreen & Killfeed */}
      <div className="absolute top-2.5 md:top-4 right-3 md:right-4 flex flex-col items-end gap-1.5 max-w-xs">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={onToggleMic}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              voice.enabled
                ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
                : 'bg-[#0b0f17]/85 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {voice.enabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{voice.enabled ? 'Mic [V]' : 'Silencio [V]'}</span>
            {voice.enabled && (
              <span className="w-6 h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                <span
                  className="block h-full bg-emerald-400"
                  style={{ width: `${Math.round(voice.level * 100)}%` }}
                />
              </span>
            )}
          </button>

          {isTouchDevice && (
            <>
              <button
                onClick={onToggleChat}
                title="Chat"
                className="p-1.5 rounded-lg bg-[#0b0f17]/85 border border-slate-700 text-slate-200 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-sky-400" />
              </button>
              <button
                onClick={onRequestFullscreenLandscape}
                title="Pantalla Completa Horizontal"
                className="p-1.5 rounded-lg bg-[#0b0f17]/85 border border-slate-700 text-slate-200 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4 text-amber-400" />
              </button>
            </>
          )}

          <button
            onClick={onResume}
            title="Pausa (Esc)"
            className="p-1.5 rounded-lg bg-[#0b0f17]/85 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>

        {voice.permissionError && (
          <div className="px-2.5 py-1 rounded bg-red-950/90 border border-red-700/60 text-[11px] text-red-200">
            {voice.permissionError}
          </div>
        )}

        {/* Compact Kill Feed */}
        <div className="flex flex-col items-end gap-1 mt-0.5">
          {hud.killFeed.map((kf) => (
            <div
              key={kf.id}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0b0f17]/80 border border-slate-800 text-[11px] md:text-xs"
            >
              <span className="font-semibold text-amber-300">{kf.killerName}</span>
              <Skull className={`w-3 h-3 ${kf.headshot ? 'text-red-400' : 'text-slate-400'}`} />
              <span className="text-slate-200">{kf.victimName}</span>
              {kf.headshot && <span className="text-[10px] font-bold text-red-400">HS</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Center Dynamic Crosshair & Hitmarker */}
      {hud.alive && !paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-12 h-12 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-amber-400" />
            <div className="absolute w-2.5 h-0.5 bg-white/90" style={{ transform: `translateX(-${spread}px)` }} />
            <div className="absolute w-2.5 h-0.5 bg-white/90" style={{ transform: `translateX(${spread}px)` }} />
            <div className="absolute h-2.5 w-0.5 bg-white/90" style={{ transform: `translateY(-${spread}px)` }} />
            <div className="absolute h-2.5 w-0.5 bg-white/90" style={{ transform: `translateY(${spread}px)` }} />

            {hud.hitmarker !== 'none' && (
              <svg width="26" height="26" viewBox="0 0 26 26" className="absolute">
                <line
                  x1="4"
                  y1="4"
                  x2="9"
                  y2="9"
                  stroke={hud.hitmarker === 'head' ? '#ef4444' : '#ffffff'}
                  strokeWidth="2.2"
                />
                <line
                  x1="22"
                  y1="4"
                  x2="17"
                  y2="9"
                  stroke={hud.hitmarker === 'head' ? '#ef4444' : '#ffffff'}
                  strokeWidth="2.2"
                />
                <line
                  x1="4"
                  y1="22"
                  x2="9"
                  y2="17"
                  stroke={hud.hitmarker === 'head' ? '#ef4444' : '#ffffff'}
                  strokeWidth="2.2"
                />
                <line
                  x1="22"
                  y1="22"
                  x2="17"
                  y2="17"
                  stroke={hud.hitmarker === 'head' ? '#ef4444' : '#ffffff'}
                  strokeWidth="2.2"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Pointer Lock Helper Banner (PC only) */}
      {!isTouchDevice && !hud.pointerLocked && !paused && !chatOpen && hud.alive && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            onClick={onRequestPointerLock}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer shadow-lg"
          >
            Haz clic aquí o en la arena para fijar el ratón y apuntar
          </button>
        </div>
      )}

      {/* Respawn Overlay */}
      {!hud.alive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
          <div className="px-8 py-5 rounded-xl bg-[#0e131c] border border-red-500/50 text-center">
            <p className="text-xs font-semibold text-red-400 mb-1">Eliminado</p>
            <p className="font-display text-2xl font-bold text-white">
              Reapareciendo en <span className="font-mono-num text-amber-400">{hud.respawnIn}s</span>
            </p>
          </div>
        </div>
      )}

      {/* Top-Left Health & Chat on Android (keeps bottom-left clean for Joystick!), Bottom-Left on PC */}
      <div
        className={`absolute ${
          isTouchDevice ? 'top-2.5 left-3 w-56' : 'bottom-4 left-4 w-80 max-w-[85vw]'
        } flex flex-col gap-2`}
      >
        {/* Integrated Chat Panel (hidden on mobile unless opened or has recent lines) */}
        {(!isTouchDevice || chatOpen) && (
          <div className="rounded-lg bg-[#0b0f17]/80 border border-slate-800 p-2.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3 text-sky-400" />
                Chat de Partida
              </span>
              {!isTouchDevice && <span>Pulsa T</span>}
            </div>
            <div className="space-y-1 max-h-20 overflow-y-auto text-xs">
              {chatMessages.slice(-4).map((m) => (
                <div key={m.id} className="leading-snug">
                  <span className="font-semibold text-amber-300">
                    {m.clanTag ? `[${m.clanTag}] ` : ''}
                    {m.senderName}:{' '}
                  </span>
                  <span className="text-slate-200">{m.text}</span>
                </div>
              ))}
            </div>
            {chatOpen && (
              <form onSubmit={handleChatSubmit} className="mt-2 flex gap-1.5 pointer-events-auto">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      onCloseChat();
                    }
                  }}
                  placeholder="Escribe a tu equipo..."
                  className="flex-1 px-2.5 py-1.5 rounded bg-[#151c28] border border-slate-600 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold text-xs cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        )}

        {/* Health & Stamina Cluster */}
        <div className="rounded-lg bg-[#0b0f17]/85 border border-slate-700/80 px-3.5 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              Salud
            </span>
            <span className="font-mono-num text-lg font-bold text-white">{hud.hp}</span>
          </div>
          <div className="w-full h-2 rounded-sm bg-slate-800 overflow-hidden mb-1.5">
            <div
              className={`h-full transition-all duration-150 ${
                hud.hp > 50 ? 'bg-emerald-500' : hud.hp > 25 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${hud.hp}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Energía</span>
            <span className="font-mono-num">{hud.stamina}%</span>
          </div>
          <div className="w-full h-1 rounded-sm bg-slate-800 overflow-hidden mt-0.5">
            <div className="h-full bg-sky-400" style={{ width: `${hud.stamina}%` }} />
          </div>
        </div>
      </div>

      {/* Weapon, Ammo & Frag Grenades (Bottom-Right on PC, Top-Left below health on Android) */}
      <div
        className={`absolute ${
          isTouchDevice ? 'top-24 left-3' : 'bottom-4 right-4'
        } flex flex-col ${isTouchDevice ? 'items-start' : 'items-end'} gap-2`}
      >
        <div
          className={`rounded-lg bg-[#0b0f17]/85 border border-slate-700/80 ${
            isTouchDevice ? 'px-3.5 py-2' : 'px-5 py-3 min-w-[205px] text-right'
          }`}
        >
          {!isTouchDevice && (
            <div className="text-[11px] text-slate-400 mb-0.5">Carabina Táctica MK-IV</div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 font-mono-num">
              <Bomb className="w-3.5 h-3.5" />
              <span>{hud.grenades}</span>
              {!isTouchDevice && <span className="text-[10px] text-slate-400">[G]</span>}
            </div>

            {hud.reloading ? (
              <div className="w-24">
                <div className="text-[11px] font-semibold text-amber-400 mb-0.5">Recargando...</div>
                <div className="w-full h-1.5 rounded-sm bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="font-mono-num">
                <span className={`text-2xl md:text-3xl font-bold ${hud.ammo <= 6 ? 'text-red-400' : 'text-white'}`}>
                  {hud.ammo}
                </span>
                <span className="text-slate-400 text-sm ml-1">/ {hud.reserveAmmo}</span>
              </div>
            )}
          </div>
          {!isTouchDevice && (
            <div className="text-[11px] text-slate-400 mt-1.5">
              R Recargar · G Granada · Tab Marcador · Esc Pausa
            </div>
          )}
        </div>
      </div>

      {/* Android Horizontal Touch Controls */}
      {isTouchDevice && hud.alive && !paused && !chatOpen && (
        <>
          {/* Left Virtual Joystick */}
          <div
            onTouchStart={handleJoyStart}
            onTouchMove={handleJoyMove}
            onTouchEnd={handleJoyEnd}
            onTouchCancel={handleJoyEnd}
            className="absolute bottom-5 left-6 w-28 h-28 rounded-full bg-[#0b0f17]/65 border-2 border-slate-500/50 flex items-center justify-center pointer-events-auto touch-none"
          >
            <div
              className="w-12 h-12 rounded-full bg-amber-500/85 border-2 border-amber-200/80 shadow-lg"
              style={{
                transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
              }}
            />
          </div>

          {/* Right Action Buttons Cluster */}
          <div className="absolute bottom-5 right-6 flex items-end gap-3 pointer-events-auto touch-none">
            <div className="flex flex-col gap-2.5 items-center">
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchGrenade();
                }}
                className="w-12 h-12 rounded-full bg-[#151d2b]/90 border border-amber-500/60 flex flex-col items-center justify-center text-amber-400 active:scale-95"
              >
                <Bomb className="w-4 h-4" />
                <span className="text-[9px] font-mono-num font-bold">{hud.grenades}</span>
              </button>

              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchReload();
                }}
                className="w-12 h-12 rounded-full bg-[#151d2b]/90 border border-slate-600 flex items-center justify-center text-slate-200 active:scale-95"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 items-center">
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchJump();
                }}
                className="w-12 h-12 rounded-full bg-[#151d2b]/90 border border-sky-500/50 flex items-center justify-center text-[10px] font-bold text-sky-300 active:scale-95"
              >
                SALTAR
              </button>

              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  onTouchFiring(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onTouchFiring(false);
                }}
                onTouchCancel={() => onTouchFiring(false)}
                className="w-18 h-18 rounded-full bg-amber-500/90 border-2 border-amber-200 flex items-center justify-center text-slate-950 font-bold shadow-lg active:scale-95"
              >
                <Crosshair className="w-7 h-7" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Tab Real-Time Scoreboard Overlay */}
      {scoreboardOpen && !paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65">
          <div className="w-full max-w-2xl rounded-xl bg-[#0e131c] border border-slate-700 p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-bold text-white">
                Clasificación de Partida en Tiempo Real
              </h3>
              <span className="font-mono-num text-xs text-slate-400">
                Meta: {hud.killTarget} Bajas
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs">
                  <th className="py-2">#</th>
                  <th className="py-2">Operador</th>
                  <th className="py-2 text-right">Bajas</th>
                  <th className="py-2 text-right">Muertes</th>
                  <th className="py-2 text-right">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {hud.scoreboard.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-800/60 ${
                      row.isSelf ? 'bg-amber-500/10 text-amber-300 font-semibold' : 'text-slate-200'
                    }`}
                  >
                    <td className="py-2 font-mono-num">{idx + 1}</td>
                    <td className="py-2">
                      {row.clanTag ? `[${row.clanTag}] ` : ''}
                      {row.name}
                      {row.isSpeaking && <span className="ml-2 text-xs text-emerald-400">Hablando</span>}
                    </td>
                    <td className="py-2 text-right font-mono-num">{row.kills}</td>
                    <td className="py-2 text-right font-mono-num">{row.deaths}</td>
                    <td className="py-2 text-right font-mono-num">{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 pointer-events-auto p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-xl bg-[#0e131c] border border-slate-700 p-5 md:p-6 my-auto">
            <h2 className="font-display text-2xl font-bold text-white mb-1">Partida en Pausa</h2>
            <p className="text-xs text-slate-400 mb-4">Ajustes rápidos · PC y Android Horizontal</p>

            <div className="space-y-3.5 mb-5">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Sensibilidad de Mira</span>
                  <span className="font-mono-num">{(sensitivity * 1000).toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.0008}
                  max={0.0055}
                  step={0.0002}
                  value={sensitivity}
                  onChange={(e) => onSensitivityChange(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">Audio del Juego</span>
                <button
                  onClick={onToggleMuteAudio}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#161e2c] border border-slate-700 text-xs text-white cursor-pointer"
                >
                  {mutedAudio ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  {mutedAudio ? 'Silenciado' : 'Activo'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">Micrófono de Voz</span>
                <button
                  onClick={onToggleMic}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#161e2c] border border-slate-700 text-xs text-white cursor-pointer"
                >
                  {voice.enabled ? <Mic className="w-4 h-4 text-emerald-400" /> : <MicOff className="w-4 h-4 text-slate-400" />}
                  {voice.enabled ? 'Transmitiendo' : 'Silenciado'}
                </button>
              </div>

              <div className="rounded-lg bg-[#141a25] border border-slate-800 p-3 text-xs text-slate-300 space-y-1">
                <div className="font-semibold text-white mb-1">Controles</div>
                <div>PC: WASD Mover · Clic Disparar · G Granada · R Recargar</div>
                <div>Android Horizontal: Joystick Izquierdo · Mira y Botones Derechos</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onResume}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Continuar
              </button>
              <button
                onClick={onExitMatch}
                className="px-4 py-2.5 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 text-sm font-medium cursor-pointer"
              >
                Salir al Menú
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
