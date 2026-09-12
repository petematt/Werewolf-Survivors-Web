import React from 'react';

interface VirtualJoystickProps {
  active: boolean;
  startX: number;
  startY: number;
  currX: number;
  currY: number;
  opacity?: number;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  active,
  startX,
  startY,
  currX,
  currY,
  opacity = 0.8,
}) => {
  if (!active) return null;

  const dx = currX - startX;
  const dy = currY - startY;
  const dist = Math.hypot(dx, dy);
  const maxRadius = 50;

  const angle = Math.atan2(dy, dx);
  const clampedDist = Math.min(dist, maxRadius);
  const knobX = Math.cos(angle) * clampedDist;
  const knobY = Math.sin(angle) * clampedDist;

  return (
    <div
      className="pointer-events-none fixed z-30 select-none"
      style={{
        left: startX,
        top: startY,
        opacity,
      }}
    >
      {/* Joystick Base Circle */}
      <div className="-translate-x-1/2 -translate-y-1/2 relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-red-500/40 bg-slate-900/60 backdrop-blur-sm shadow-xl shadow-red-950/50">
        {/* Direction Crosshairs */}
        <div className="absolute h-full w-0.5 bg-red-500/20" />
        <div className="absolute h-0.5 w-full bg-red-500/20" />

        {/* Dynamic Knob */}
        <div
          className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full border border-red-400 bg-gradient-to-br from-red-500 to-red-800 shadow-lg shadow-red-500/50"
          style={{
            transform: `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`,
          }}
        />
      </div>
    </div>
  );
};
