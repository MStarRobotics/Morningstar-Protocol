import React from 'react';
import { useGlitch } from 'react-powerglitch';
import { Power } from 'lucide-react';

interface ExecuteNodeProps {
  onClick: () => void;
  onWarmup?: () => void;
}

export const ExecuteNode: React.FC<ExecuteNodeProps> = ({ onClick, onWarmup }) => {
  const glitch = useGlitch({
    playMode: 'hover',
    createContainers: true,
    slice: {
      count: 6,
      velocity: 15,
      minHeight: 0.02,
      maxHeight: 0.15,
      hueRotate: true,
    },
    pulse: {
      scale: 2,
    },
  });

  return (
    <button
      ref={glitch.ref}
      onClick={onClick}
      onMouseEnter={onWarmup}
      onFocus={onWarmup}
      onTouchStart={onWarmup}
      className="relative group px-8 py-4 bg-black border border-[#00ff41] text-[#00ff41] font-mono text-xl uppercase tracking-widest overflow-hidden hover:bg-[#00ff41] hover:text-black transition-colors duration-300 shadow-[0_0_10px_#00ff41] [clip-path:polygon(10%_0,100%_0,100%_70%,90%_100%,0_100%,0_30%)]"
    >
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWgydjJIMUMxeiIgZmlsbD0iIzAwZmY0MSIgZmlsbC1vcGFjaXR5PSIwLjEiLz48L3N2Zz4=')] opacity-20 pointer-events-none" />
      <div className="flex items-center gap-3 relative z-10">
        <Power className="w-5 h-5" />
        <span className="font-bold">EXECUTE_NODE</span>
      </div>

      {/* Scanline effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[rgba(0,255,65,0.1)] to-transparent h-1/4 w-full animate-scanline pointer-events-none" />
    </button>
  );
};
