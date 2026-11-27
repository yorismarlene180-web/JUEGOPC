import React, { useEffect } from 'react';
import { Crosshair, Play, Shield, Users } from 'lucide-react';

interface TitleScreenProps {
  playerName: string;
  onNameChange: (name: string) => void;
  onEnterMenu: () => void;
  onQuickPlayOffline: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  playerName,
  onNameChange,
  onEnterMenu,
  onQuickPlayOffline,
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
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none bg-gradient-to-r from-[#090c11]/90 via-[#090c11]/45 to-transparent p-8 md:p-12">
      {/* Top subtle platform tag */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs font-medium text-slate-300 tracking-wide">
          <span>Edición Windows PC</span>
          <span aria-hidden="true">·</span>
          <span>Motor Táctico 3D</span>
          <span aria-hidden="true">·</span>
          <span>Servidor en Tiempo Real</span>
        </div>
      </div>

      {/* Hero Title Lockup & Quick Entry */}
      <div className="max-w-xl pointer-events-auto my-auto">
        {/* Bespoke SVG Emblem + Wordmark */}
        <div className="flex items-center gap-4 mb-4">
          <svg
            width="56"
            height="56"
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
              Combate Táctico en Arena 3D
            </p>
            <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight text-white leading-none">
              BATTLEPLAYERS
            </h1>
          </div>
        </div>

        <p className="text-slate-300 text-base leading-relaxed mb-7 max-w-lg">
          Entrena sin conexión contra escuadrones de bots o compite en línea con tus amigos. Chat integrado con micrófono, tienda de avatar, clanes y clasificación global en tiempo real.
        </p>

        {/* Callsign Input */}
        <div className="mb-5 max-w-sm">
          <label htmlFor="bp-callsign" className="block text-xs font-medium text-slate-400 mb-1.5">
            Nombre de Operador
          </label>
          <input
            id="bp-callsign"
            type="text"
            maxLength={20}
            value={playerName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Tu nombre en arena..."
            className="w-full px-4 py-2.5 rounded-lg bg-[#111722] border border-slate-700 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Primary Action Cluster */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onEnterMenu}
            className="flex items-center gap-2.5 px-6 py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-5 h-5 fill-current" />
            Entrar al Centro Táctico
          </button>

          <button
            onClick={onQuickPlayOffline}
            className="flex items-center gap-2 px-5 py-3.5 rounded-lg bg-[#161e2c] hover:bg-[#1f293b] border border-slate-700 text-slate-100 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Crosshair className="w-4 h-4 text-amber-400" />
            Partida Rápida Offline (Bots)
          </button>
        </div>

        {/* Clean feature summary line */}
        <div className="flex flex-wrap items-center gap-4 mt-6 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            Bots Offline
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            Salas Privadas con Amigos
          </span>
          <span aria-hidden="true">·</span>
          <span>Voz y Chat en Vivo</span>
        </div>
      </div>

      {/* Single flat control-hint line */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4 text-xs text-slate-400">
        <p className="font-mono-num">
          WASD Mover · Ratón Apuntar · Clic Disparar · R Recargar · Espacio Saltar · V Micrófono · T Chat · Esc Pausa
        </p>
        <span>Pulsa Enter para continuar</span>
      </div>
    </div>
  );
};
