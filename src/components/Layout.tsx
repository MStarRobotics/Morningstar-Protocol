import React from 'react';
import { Role } from '../types';
import { LogOut, Hexagon, AlertTriangle } from 'lucide-react';
import { GlitchText } from './UI';
import { useWallet } from '../services/WalletContext';

interface Props {
  role: Role;
  onLogout: () => void;
  children: React.ReactNode;
}

const Layout: React.FC<Props> = ({ role, onLogout, children }) => {
  const wallet = useWallet();

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col screen-tear">
      {/* Global Backgrounds */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-background-dark to-background-dark pointer-events-none z-0"></div>
      <div className="holo-grid-container"></div>
      <div className="scanline-effect"></div>

      {/* Ambient Glows */}
      <div className="fixed top-[-10%] right-[-10%] w-[320px] h-[320px] md:w-[600px] md:h-[600px] bg-primary/10 rounded-full blur-[100px] md:blur-[120px] pointer-events-none z-0 animate-float"></div>
      <div className="fixed bottom-[-10%] left-[-10%] w-[260px] h-[260px] md:w-[500px] md:h-[500px] bg-highlight/10 rounded-full blur-[80px] md:blur-[100px] pointer-events-none z-0 animate-float" style={{ animationDelay: '4s' }}></div>

      {/* Noise texture */}
      <div className="fixed inset-0 noise-overlay pointer-events-none z-[1] opacity-30"></div>

      {/* Navigation */}
      {role !== 'guest' && (
        <nav className="border-b border-white/5 sticky top-0 z-40 backdrop-blur-xl bg-background-dark/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="relative">
                <div className="absolute inset-0 bg-primary blur-sm opacity-50"></div>
                <div className="w-10 h-10 bg-black/40 border border-primary/30 rounded flex items-center justify-center text-primary font-bold relative z-10">
                  <Hexagon className="w-6 h-6" />
                </div>
              </div>
              <div className="min-w-0">
                <span className="font-bold text-white tracking-tight text-base sm:text-xl font-display block leading-none truncate">
                    <GlitchText text="MORNINGSTAR" intensity="intense" />
                </span>
                <span className="hidden sm:block text-[10px] font-mono text-data tracking-widest uppercase">Protocol v3.0.1</span>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-6">
               {/* Network indicator */}
               {!wallet.isMock && !wallet.isCorrectNetwork && wallet.address && (
                 <button
                   onClick={() => wallet.switchNetwork()}
                   className="hidden md:flex items-center gap-2 px-3 py-1 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                 >
                   <AlertTriangle className="w-3 h-3 text-amber-500" />
                   <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">WRONG_NETWORK</span>
                 </button>
               )}

               <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded border border-highlight/20 bg-highlight/5">
                 <span className={`w-2 h-2 rounded-full animate-pulse ${wallet.isCorrectNetwork || wallet.isMock ? 'bg-highlight' : 'bg-amber-500'}`}></span>
                 <span className="text-xs font-mono text-highlight uppercase tracking-wider">{role}_ACCESS</span>
               </div>

               <div className="flex items-center gap-2 sm:gap-4">
                 <div className="flex items-center gap-2 text-sm text-text-muted bg-white/5 px-2.5 sm:px-4 py-2 rounded-none border-l-2 border-primary hover:bg-white/10 transition-colors cursor-pointer cyber-corner">
                   <span className="material-symbols-outlined text-primary text-sm">fingerprint</span>
                   <span className="hidden sm:inline font-mono">{wallet.displayAddress || '0x...'}</span>
                   {wallet.isMock && <span className="text-[9px] text-amber-500 border border-amber-500/30 px-1 bg-amber-500/10">MOCK</span>}
                 </div>
                 <button onClick={onLogout} className="p-2 text-text-muted hover:text-red-500 transition-colors">
                   <LogOut className="w-5 h-5" />
                 </button>
               </div>
            </div>
          </div>
        </nav>
      )}

      <main className="relative z-10 flex-grow">
        {children}
      </main>

      {/* Bottom accent line — animated gradient flow */}
      <div className="fixed bottom-0 left-0 w-full h-[2px] gradient-flow z-50 opacity-60"></div>
    </div>
  );
};

export default Layout;
