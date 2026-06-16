import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { CLOUD_WHALE_APPROACH_DURATION, CLOUD_WHALE_LEAVE_DURATION } from '../utils/constants';

export const CloudWhale: React.FC = () => {
  const { cloudWhale } = useGameStore();

  if (cloudWhale.state === 'away') return null;

  const getWhalePosition = () => {
    switch (cloudWhale.state) {
      case 'approaching': {
        const progress = cloudWhale.progress / CLOUD_WHALE_APPROACH_DURATION;
        const x = -20 + progress * 50;
        const y = 10 + Math.sin(progress * Math.PI) * 5;
        return { x, y, scale: 0.5 + progress * 0.5 };
      }
      case 'docked': {
        const floatOffset = Math.sin(Date.now() / 1000) * 2;
        return { x: 30, y: 15 + floatOffset, scale: 1 };
      }
      case 'leaving': {
        const progress = cloudWhale.progress / CLOUD_WHALE_LEAVE_DURATION;
        const x = 30 + progress * 80;
        const y = 15 + Math.sin(progress * Math.PI) * 5;
        return { x, y, scale: 1 - progress * 0.5 };
      }
      default:
        return { x: -20, y: 10, scale: 0.5 };
    }
  };

  const pos = getWhalePosition();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
      <div
        className="absolute transition-all duration-500 ease-in-out"
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: `scale(${pos.scale})`,
          filter: 'drop-shadow(0 4px 20px rgba(147, 197, 253, 0.5))',
        }}
      >
        <div className="relative">
          <div className="text-7xl" style={{ animation: 'whaleFloat 4s ease-in-out infinite' }}>
            🐋
          </div>

          {cloudWhale.state === 'docked' && (
            <>
              <div
                className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-8 rounded-full opacity-60"
                style={{
                  background:
                    'radial-gradient(ellipse, rgba(147, 197, 253, 0.6) 0%, transparent 70%)',
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="absolute text-lg"
                  style={{
                    left: `${20 + i * 15}%`,
                    top: '80%',
                    animation: `crystalFall ${2 + i * 0.3}s ease-in infinite`,
                    animationDelay: `${i * 0.4}s`,
                  }}
                >
                  💎
                </div>
              ))}
            </>
          )}

          {cloudWhale.state === 'approaching' && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-sm bg-white/80 px-2 py-1 rounded-full text-blue-600 font-medium shadow-md">
                云鲸飞来啦~
              </span>
            </div>
          )}

          {cloudWhale.state === 'docked' && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-sm bg-green-100/90 px-2 py-1 rounded-full text-green-600 font-medium shadow-md">
                充电中 ⚡
              </span>
            </div>
          )}

          {cloudWhale.state === 'leaving' && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-sm bg-gray-100/90 px-2 py-1 rounded-full text-gray-600 font-medium shadow-md">
                云鲸飞走了~
              </span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes whaleFloat {
          0%, 100% { transform: translateY(0px) rotate(-2deg); }
          50% { transform: translateY(-10px) rotate(2deg); }
        }
        @keyframes crystalFall {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translateY(60px) scale(0.5) rotate(180deg);
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.8; transform: translateX(-50%) scale(1.2); }
        }
      `}</style>
    </div>
  );
};
