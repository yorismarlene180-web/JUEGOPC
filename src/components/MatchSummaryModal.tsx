import React, { useState } from 'react';
import { Award, Check, Copy, Download, RotateCcw, Share2, Trophy } from 'lucide-react';
import { ACHIEVEMENT_META } from '../data/catalog';
import type { MatchSummary } from '../types/game';

interface MatchSummaryModalProps {
  summary: MatchSummary;
  playerName: string;
  clanTag: string;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
}

function generateAchievementCardPng(
  summary: MatchSummary,
  playerName: string,
  clanTag: string,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d')!;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 1200, 630);
  grad.addColorStop(0, '#0a0e16');
  grad.addColorStop(1, '#162032');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  // Subtle tactical grid
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1200; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 630);
    ctx.stroke();
  }
  for (let y = 0; y < 630; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }

  // Border frame
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, 1152, 582);

  // Brand title
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('BATTLEPLAYERS · EDICIÓN PC WINDOWS', 64, 88);

  // Outcome
  ctx.fillStyle = summary.won ? '#34d399' : '#f8fafc';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText(summary.won ? 'VICTORIA EN ARENA' : `PUESTO #${summary.placement} EN ARENA`, 64, 175);

  // Player & Clan
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 32px sans-serif';
  ctx.fillText(`${clanTag ? `[${clanTag}] ` : ''}${playerName}`, 64, 232);

  // Stat boxes
  const acc = summary.shotsFired > 0 ? Math.round((summary.shotsHit / summary.shotsFired) * 100) : 0;
  const stats = [
    { label: 'BAJAS', value: String(summary.kills) },
    { label: 'MUERTES', value: String(summary.deaths) },
    { label: 'HEADSHOTS', value: String(summary.headshots) },
    { label: 'PRECISIÓN', value: `${acc}%` },
  ];

  stats.forEach((st, i) => {
    const bx = 64 + i * 272;
    const by = 290;
    ctx.fillStyle = '#111827';
    ctx.fillRect(bx, by, 248, 150);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, 248, 150);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(st.label, bx + 24, by + 48);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 54px monospace';
    ctx.fillText(st.value, bx + 24, by + 118);
  });

  // Achievements row
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 22px sans-serif';
  const achText =
    summary.unlockedAchievements.length > 0
      ? `Logros desbloqueados: ${summary.unlockedAchievements.map((id) => ACHIEVEMENT_META[id]?.title || id).join(' · ')}`
      : `Modo ${summary.mode === 'offline' ? 'Offline Bots' : `Multijugador (${summary.roomCode})`} · +${summary.coinsEarned} Monedas`;
  ctx.fillText(achText, 64, 520);

  ctx.fillStyle = '#64748b';
  ctx.font = '18px sans-serif';
  ctx.fillText('battleplayers-pc · Arena Táctica 3D', 64, 566);

  return canvas.toDataURL('image/png');
}

export const MatchSummaryModal: React.FC<MatchSummaryModalProps> = ({
  summary,
  playerName,
  clanTag,
  onPlayAgain,
  onBackToMenu,
}) => {
  const [copied, setCopied] = useState(false);

  const accuracy =
    summary.shotsFired > 0 ? Math.round((summary.shotsHit / summary.shotsFired) * 100) : 0;

  const shareText = `Acabo de terminar en el puesto #${summary.placement} en BATTLEPLAYERS (PC 3D) con ${summary.kills} bajas, ${summary.headshots} headshots y ${accuracy}% de precisión.${
    summary.unlockedAchievements.length > 0
      ? ` Logros: ${summary.unlockedAchievements.map((a) => ACHIEVEMENT_META[a]?.title || a).join(', ')}.`
      : ''
  }`;

  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(window.location.origin);

  const handleCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText} ${window.location.origin}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleDownloadCard = () => {
    const dataUrl = generateAchievementCardPng(summary, playerName, clanTag);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `BATTLEPLAYERS_${playerName}_${summary.kills}kills.png`;
    link.click();
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mis logros en BATTLEPLAYERS',
          text: shareText,
          url: window.location.origin,
        });
      } catch {
        // user cancelled
      }
    } else {
      handleCopyShare();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#070a0f]/90 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-xl bg-[#0e131c] border border-slate-700 p-6 md:p-8 my-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
          <div>
            <div className="text-xs font-semibold text-amber-400 mb-1">
              {summary.mode === 'offline' ? 'Partida Offline con Bots' : `Sala Multijugador · ${summary.roomCode}`}
            </div>
            <h2 className="font-display text-3xl font-bold text-white">
              {summary.won ? 'Victoria en la Arena' : `Puesto #${summary.placement} Finalizado`}
            </h2>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-xs text-slate-400">Recompensa</div>
              <div className="font-mono-num text-lg font-bold text-amber-400">
                +{summary.coinsEarned} Monedas
              </div>
              <div className="font-mono-num text-xs text-sky-400">+{summary.xpEarned} XP</div>
            </div>
            <Trophy className={`w-9 h-9 ${summary.won ? 'text-amber-400' : 'text-slate-500'}`} />
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-lg bg-[#141b26] border border-slate-800 p-3.5">
            <div className="text-xs text-slate-400">Bajas / Muertes</div>
            <div className="font-mono-num text-2xl font-bold text-white mt-0.5">
              {summary.kills} / {summary.deaths}
            </div>
          </div>
          <div className="rounded-lg bg-[#141b26] border border-slate-800 p-3.5">
            <div className="text-xs text-slate-400">Headshots</div>
            <div className="font-mono-num text-2xl font-bold text-amber-400 mt-0.5">
              {summary.headshots}
            </div>
          </div>
          <div className="rounded-lg bg-[#141b26] border border-slate-800 p-3.5">
            <div className="text-xs text-slate-400">Precisión</div>
            <div className="font-mono-num text-2xl font-bold text-emerald-400 mt-0.5">
              {accuracy}%
            </div>
          </div>
          <div className="rounded-lg bg-[#141b26] border border-slate-800 p-3.5">
            <div className="text-xs text-slate-400">Puntos de Clan</div>
            <div className="font-mono-num text-2xl font-bold text-sky-400 mt-0.5">
              +{summary.clanPointsEarned}
            </div>
          </div>
        </div>

        {/* Unlocked Achievements */}
        {summary.unlockedAchievements.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-semibold text-slate-300 mb-2">Logros Obtenidos</div>
            <div className="flex flex-wrap gap-2">
              {summary.unlockedAchievements.map((achId) => {
                const meta = ACHIEVEMENT_META[achId];
                return (
                  <div
                    key={achId}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/40 text-xs"
                  >
                    <Award className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-amber-300">{meta?.title || achId}</div>
                      <div className="text-slate-400">{meta?.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Social Sharing Section */}
        <div className="rounded-lg bg-[#121824] border border-slate-800 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Share2 className="w-4 h-4 text-amber-400" />
              Compartir Logros en Redes Sociales
            </div>
            <button
              onClick={handleDownloadCard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              Descargar Tarjeta PNG
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-[#1a2232] hover:bg-[#232d42] border border-slate-700 text-xs font-medium text-white"
            >
              Compartir en X
            </a>
            <a
              href={`https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-[#122b24] hover:bg-[#193b31] border border-emerald-700/50 text-xs font-medium text-emerald-200"
            >
              WhatsApp
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-[#17233b] hover:bg-[#1e2e4f] border border-sky-700/50 text-xs font-medium text-sky-200"
            >
              Facebook
            </a>
            <button
              onClick={handleCopyShare}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1a2232] hover:bg-[#232d42] border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado para Discord / Redes' : 'Copiar Resumen'}
            </button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="px-3.5 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-xs font-medium text-amber-300 cursor-pointer"
              >
                Compartir Directo
              </button>
            )}
          </div>
        </div>

        {/* Footer CTAs */}
        <div className="flex flex-wrap gap-3 justify-end">
          <button
            onClick={onBackToMenu}
            className="px-5 py-2.5 rounded-lg bg-[#171f2e] hover:bg-[#1e293d] border border-slate-700 text-sm font-medium text-slate-200 cursor-pointer"
          >
            Volver al Menú
          </button>
          <button
            onClick={onPlayAgain}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Jugar Otra Partida
          </button>
        </div>
      </div>
    </div>
  );
};
