import React from 'react';
import { useGameStore } from '../store/useGameStore';
import {
  CLOUD_WHALE_APPROACH_DURATION,
  CLOUD_WHALE_LEAVE_DURATION,
  GRID_SIZE,
} from '../utils/constants';

export const CloudWhale: React.FC = () => {
  const { cloudWhale } = useGameStore();

  if (cloudWhale.state === 'away') return null;

  const targetXPercent = 15 + (cloudWhale.dockX / GRID_SIZE) * 70;

  const getWhalePosition = () => {
    switch (cloudWhale.state) {
      case 'approaching': {
        const progress = cloudWhale.progress / CLOUD_WHALE_APPROACH_DURATION;
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const x = -15 + easeProgress * (targetXPercent + 15);
        const y = 8 + Math.sin(progress * Math.PI) * 8;
        return { x, y, scale: 0.4 + easeProgress * 0.6 };
      }
      case 'docked': {
        const floatOffset = Math.sin(Date.now() / 800) * 4;
        return { x: targetXPercent, y: 10 + floatOffset, scale: 1 };
      }
      case 'leaving': {
        const progress = cloudWhale.progress / CLOUD_WHALE_LEAVE_DURATION;
        const easeProgress = progress * progress;
        const x = targetXPercent + easeProgress * (115 - targetXPercent);
        const y = 10 + Math.sin(progress * Math.PI) * 6;
        return { x, y, scale: 1 - easeProgress * 0.6 };
      }
      default:
        return { x: -20, y: 10, scale: 0.5 };
    }
  };

  const pos = getWhalePosition();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
      <div
        className="absolute transition-all duration-300 ease-out"
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: `translate(-50%, -50%) scale(${pos.scale})`,
          filter: 'drop-shadow(0 4px 25px rgba(147, 197, 253, 0.6))',
        }}
      >
        <div className="relative">
          <div
            className="text-6xl md:text-7xl"
            style={{ animation: 'whaleFloat 4s ease-in-out infinite' }}
          >
            🐋
          </div>

          {cloudWhale.state === 'docked' && (
            <>
              <div
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-28 h-10 rounded-full opacity-50"
                style={{
                  background:
                    'radial-gradient(ellipse, rgba(147, 197, 253, 0.7) 0%, transparent 70%)',
                  animation: 'whaleGlow 2s ease-in-out infinite',
                }}
              />
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-36 h-16">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute text-sm"
                    style={{
                      left: `${10 + i * 16}%`,
                      top: '0%',
                      animation: `crystalFall ${1.8 + i * 0.25}s ease-in infinite`,
                      animationDelay: `${i * 0.35}s`,
                    }}
                  >
                    💎
                  </div>
                ))}
              </div>
            </>
          )}

          {cloudWhale.state === 'approaching' && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-xs md:text-sm bg-white/90 px-3 py-1.5 rounded-full text-blue-600 font-bold shadow-lg">
                🐋 云鲸飞来啦~
              </span>
            </div>
          )}

          {cloudWhale.state === 'docked' && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-xs md:text-sm bg-green-100/95 px-3 py-1.5 rounded-full text-green-600 font-bold shadow-lg">
                �?充电�?· 风力+2
              </span>
            </div>
          )}

          {cloudWhale.state === 'leaving' && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-xs md:text-sm bg-gray-100/90 px-3 py-1.5 rounded-full text-gray-500 font-bold shadow-lg">
                👋 下次再见~
              </span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes whaleFloat {
          0%, 100% { transform: translateY(0px) rotate(-3deg); }
          50% { transform: translateY(-12px) rotate(3deg); }
        }
        @keyframes whaleGlow {
          0%, 100% { opacity: 0.4; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.8; transform: translateX(-50%) scale(1.3); }
        }
        @keyframes crystalFall {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translateY(80px) scale(0.4) rotate(270deg);
          }
        }
      `}</style>
    </div>
  );
};
