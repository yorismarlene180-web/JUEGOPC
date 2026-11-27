import React, { useState } from 'react';
import { Check, Download, Laptop, Package, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface InstallDownloadModalProps {
  open: boolean;
  onClose: () => void;
}

export const InstallDownloadModal: React.FC<InstallDownloadModalProps> = ({ open, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [installSuccess, setInstallSuccess] = useState(false);

  if (!open) return null;

  const handleInstallClick = async () => {
    const accepted = await install();
    if (accepted) {
      setInstallSuccess(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-[#0e131d] border border-slate-700 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Descargar e Instalar BATTLEPLAYERS
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Instálalo al instante como aplicación de escritorio en Windows / Android o descarga el kit para compilar .EXE y .APK.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-lg bg-[#161e2e] hover:bg-[#1f2b42] border border-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1: Instant 1-Click OS App Install (Windows & Android) */}
          <div className="rounded-xl bg-[#131926] border border-amber-500/40 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-amber-400 mb-2">
                <Laptop className="w-5 h-5" />
                <Smartphone className="w-5 h-5" />
                <span className="font-display font-bold text-base text-white">
                  Instalación Directa (Windows y Android)
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Crea el acceso directo nativo con su propio icono y ventana independiente sin barras del navegador. En Android se abre en horizontal a pantalla completa.
              </p>

              {isInstalled || installSuccess ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-950/60 border border-emerald-600/50 p-3 text-xs font-semibold text-emerald-300 mb-3">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>BATTLEPLAYERS ya está instalado en tu dispositivo.</span>
                </div>
              ) : isInstallable ? (
                <button
                  onClick={handleInstallClick}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm cursor-pointer mb-3"
                >
                  <Download className="w-4 h-4" />
                  Instalar App Ahora
                </button>
              ) : isIOS ? (
                <div className="rounded-lg bg-[#1a2232] border border-slate-700 p-3 text-xs text-slate-300 space-y-1 mb-3">
                  <div className="font-semibold text-white">Instalación en iPhone / iPad:</div>
                  <div>1. Toca el botón Compartir en Safari.</div>
                  <div>2. Selecciona Añadir a pantalla de inicio.</div>
                </div>
              ) : (
                <div className="rounded-lg bg-[#1a2232] border border-slate-700 p-3 text-xs text-slate-300 space-y-1.5 mb-3">
                  <div className="font-semibold text-white">Si estás en vista previa o sin el botón directo:</div>
                  <div>· Windows Chrome / Edge: abre la URL del juego en una pestaña y elige <strong>Instalar BATTLEPLAYERS</strong> en la barra de direcciones.</div>
                  <div>· Android Chrome: menú <strong>⋮ → Instalar aplicación</strong>.</div>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-400">
              Recomendado para jugar ya mismo sin compilación adicional.
            </div>
          </div>

          {/* Option 2: Downloadable .EXE (Windows) + .APK (Android) Builder Kit */}
          <div className="rounded-xl bg-[#131926] border border-sky-500/40 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-sky-400 mb-2">
                <Package className="w-5 h-5" />
                <span className="font-display font-bold text-base text-white">
                  Kit Empaquetador .EXE y .APK
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                Descarga un paquete ZIP con ambos proyectos ya configurados y enlazados a este servidor en línea:
              </p>
              <ul className="text-xs text-slate-300 space-y-1.5 mb-4">
                <li>
                  <strong className="text-white">windows-exe/:</strong> proyecto Electron + script <span className="font-mono-num text-sky-300">CREAR-EXE-WINDOWS.bat</span> para generar el instalador <span className="font-mono-num">.exe</span> en tu PC.
                </li>
                <li>
                  <strong className="text-white">android-apk/:</strong> proyecto Capacitor configurado en horizontal para generar el <span className="font-mono-num">.apk</span> en Android Studio.
                </li>
              </ul>
            </div>

            <a
              href="/api/download/native-kit"
              download="BATTLEPLAYERS-Windows-EXE-Android-APK-Kit.zip"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-display font-bold text-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Descargar Kit (.ZIP) para PC y Android
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
