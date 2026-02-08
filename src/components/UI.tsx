import React from 'react';
import { Loader2 } from 'lucide-react';

export const GlitchText: React.FC<{
  text: string;
  as?: React.ElementType;
  className?: string;
  intensity?: 'subtle' | 'intense' | 'heavy';
}> = ({ text, as: Component = 'span', className = '', intensity = 'subtle' }) => {
  const glitchClass = intensity === 'heavy' ? 'glitch-heavy' : intensity === 'intense' ? 'glitch-intense' : 'glitch';
  return (
    <Component className={`${glitchClass} ${className}`} data-text={text}>
      {text}
    </Component>
  );
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'outline', isLoading?: boolean }> = 
({ children, variant = 'primary', isLoading, className = '', ...props }) => {
  
  const baseStyle = "relative group px-6 py-3 font-display font-bold tracking-wide transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden";
  
  const variants = {
    primary: "bg-primary text-white border border-primary/50 hover:bg-primary-hover shadow-neon clip-path-polygon",
    secondary: "bg-data/10 text-data border border-data/50 hover:bg-data/20 hover:shadow-neon-cyan",
    danger: "bg-red-900/20 text-red-500 border border-red-500/50 hover:bg-red-900/40",
    outline: "bg-transparent text-text-muted border border-white/20 hover:border-highlight hover:text-highlight hover:bg-highlight/5"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} disabled={isLoading} {...props}>
      {/* Glitch overlay effect on hover for primary/secondary */}
      {(variant === 'primary' || variant === 'secondary') && (
        <div className="absolute inset-0 bg-white/10 skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none"></div>
      )}
      
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-white/50 opacity-50 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-white/50 opacity-50 group-hover:opacity-100 transition-opacity"></div>

      <span className="relative z-10 flex items-center justify-center gap-2">
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </span>
    </button>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string; icon?: React.ReactNode }> = ({ children, className = '', title, icon }) => (
  <div className={`glass-panel p-6 cyber-corner ${className}`}>
    {(title || icon) && (
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
        {icon && <div className="text-highlight">{icon}</div>}
        {title && (
            <h3 className="text-lg font-bold text-white font-display tracking-wide">
                <GlitchText text={title} />
            </h3>
        )}
      </div>
    )}
    <div className="relative z-10">
      {children}
    </div>
  </div>
);

export const Badge: React.FC<{ status: string }> = ({ status }) => {
  const styles = {
    active: "bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]",
    verified: "bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]",
    revoked: "bg-red-500/10 text-red-500 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]",
    suspended: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    pending: "bg-data/10 text-data border-data/30",
    valid: "bg-green-500/10 text-green-400 border-green-500/30",
    incomplete: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    invalid: "bg-red-500/10 text-red-500 border-red-500/30",
    connected: "bg-highlight/10 text-highlight border-highlight/30 shadow-[0_0_10px_rgba(255,0,255,0.2)]"
  };
  // Default fallback
  const key = (status.toLowerCase() in styles) ? status.toLowerCase() as keyof typeof styles : 'pending';
  
  return (
    <span className={`px-2 py-0.5 text-[10px] uppercase font-mono tracking-wider border ${styles[key] || "bg-slate-800 text-slate-400 border-slate-700"}`}>
      {status}
    </span>
  );
};

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in duration-200 border border-primary/30 cyber-corner">
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-black/20">
          <h3 className="font-bold text-lg text-white font-display uppercase tracking-widest">
            <GlitchText text={title} />
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};