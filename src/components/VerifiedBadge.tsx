import React from 'react';
import { isVerifiedPlayer } from '../types/game';

interface VerifiedBadgeProps {
  name?: string;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  name,
  size = 'sm',
  showLabel = false,
}) => {
  if (!isVerifiedPlayer(name)) return null;

  const px = size === 'xs' ? 13 : size === 'md' ? 18 : 15;

  return (
    <span
      title="Jugador Verificado Oficial"
      aria-label="Verificado"
      className="inline-flex items-center gap-1 shrink-0 align-middle"
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <path
          d="M12 2L14.8 4.1L18.3 3.7L19.5 7L22.5 8.8L21.5 12.2L22.5 15.6L19.5 17.4L18.3 20.7L14.8 20.3L12 22.4L9.2 20.3L5.7 20.7L4.5 17.4L1.5 15.6L2.5 12.2L1.5 8.8L4.5 7L5.7 3.7L9.2 4.1L12 2Z"
          fill="#0EA5E9"
          stroke="#BAE6FD"
          strokeWidth="1.2"
        />
        <path
          d="M8.5 12.2L10.9 14.6L15.8 9.6"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
          Verificado
        </span>
      )}
    </span>
  );
};
