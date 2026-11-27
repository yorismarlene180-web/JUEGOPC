import React, { useEffect } from 'react';
import { Crosshair, Download, Maximize2, Play, Shield, Users, Wifi } from 'lucide-react';

interface TitleScreenProps {
  playerName: string;
  isTouchDevice: boolean;
  onNameChange: (name: string) => void;
  onEnterMenu: () => void;
  onQuickPlayBots: () => void;
  onRequestFullscreenLandscape: () => void;
  onOpenInstallModal: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  playerName,
  isTouchDevice,
  onNameChange,
  onEnterMenu,
  onQuickPlayBots,
  onRequestFullscreenLandscape,
  onOpenInstallModal,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') {
        if (e.key === 'Enter') onEnterMenu();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnterMenu();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEnterMenu]);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between overflow-y-auto pointer-events-none bg-gradient-to-r from-[#090c11]/92 via-[#090c11]/55 to-transparent p-5 md:p-12">
      {/* Top platform & online tag */}
      <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
        <div className="flex items-center gap-3 text-xs font-medium text-slate-300 tracking-wide">
          <span>PC Windows y Android Horizontal</span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Wifi className="w-3.5 h-3.5" />
            Conexión en Línea Activa
          </span>
        </div>

        {isTouchDevice && (
          <button
            onClick={onRequestFullscreenLandscape}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161e2c] border border-slate-700 text-xs font-semibold text-amber-300 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Pantalla Completa Horizontal
          </button>
        )}
      </div>

      {/* Hero Title Lockup & Quick Entry */}
      <div className="max-w-xl pointer-events-auto my-4 md:my-auto">
        <div className="flex items-center gap-3 md:gap-4 mb-3">
          <svg
            width="48"
            height="48"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
            aria-hidden="true"
          >
            <polygon
              points="32,4 58,18 58,46 32,60 6,46 6,18"
              fill="#111827"
              stroke="#F59E0B"
              strokeWidth="3"
            />
            <polygon points="32,12 49,22 49,42 32,52 15,42 15,22" fill="#1F2937" />
            <circle cx="32" cy="32" r="9" stroke="#F59E0B" strokeWidth="2.5" />
            <line x1="32" y1="16" x2="32" y2="25" stroke="#F59E0B" strokeWidth="2.5" />
            <line x1="32" y1="39" x2="32" y2="48" stroke="#F59E0B" strokeWidth="2.5" />
            <line x1="16" y1="32" x2="25" y2="32" stroke="#F59E0B" strokeWidth="2.5" />
            <line x1="39" y1="32" x2="48" y2="32" stroke="#F59E0B" strokeWidth="2.5" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-amber-400 tracking-wider">
              Combate Táctico en Arena 3D · Juego con Internet
            </p>
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight text-white leading-none">
              BATTLEPLAYERS
            </h1>
          </div>
        </div>

        <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-5 max-w-lg">
          Compite en línea contra escuadrones de bots que luchan entre sí o en salas multijugador con amigos. Incluye granadas de fragmentación, chat con micrófono, tienda 3D, clanes y clasificación global.
        </p>

        {/* Callsign Input */}
        <div className="mb-4 max-w-sm">
          <label htmlFor="bp-callsign" className="block text-xs font-medium text-slate-400 mb-1">
            Nombre de Operador
          </label>
          <input
            id="bp-callsign"
            type="text"
            maxLength={20}
            value={playerName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Tu nombre en arena..."
            className="w-full px-3.5 py-2 rounded-lg bg-[#111722] border border-slate-700 text-white text-sm font-medium focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Primary Action Cluster */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onEnterMenu}
            className="flex items-center gap-2 px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm md:text-base tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            Entrar al Centro Táctico
          </button>

          <button
            onClick={onQuickPlayBots}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#161e2c] hover:bg-[#1f293b] border border-slate-700 text-slate-100 font-semibold text-xs md:text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Crosshair className="w-4 h-4 text-amber-400" />
            Partida Rápida (Bots en Línea)
          </button>

          <button
            onClick={onOpenInstallModal}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#161e2c] hover:bg-[#1f293b] border border-sky-500/50 text-sky-300 font-semibold text-xs md:text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Descargar PC / Android
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            Bots vs Bots y Jugador
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            Salas Privadas con Amigos
          </span>
          <span aria-hidden="true">·</span>
          <span>Granadas + Voz en Vivo</span>
        </div>
      </div>

      {/* Single flat control-hint line */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-3 text-xs text-slate-400">
        <p className="font-mono-num">
          {isTouchDevice
            ? 'Joystick Izquierdo Mover · Derecha Apuntar · Botones Disparar/Granada/Saltar'
            : 'WASD Mover · Ratón Apuntar · Clic Disparar · G Granada · R Recargar · V Micrófono · T Chat'}
        </p>
        <span className="hidden md:inline">Pulsa Enter para continuar</span>
      </div>
    </div>
  );
};
