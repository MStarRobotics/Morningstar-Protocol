import React, { useState, useEffect } from 'react';
import { Role } from '../types';
import { getNetworkStats } from '../services/mockBlockchain';
import { useWallet } from '../services/WalletContext';
import {
  Loader2,
  ShieldCheck,
  CheckCircle,
  ScanLine,
  Hexagon,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../components/UI';
import { logger } from '../services/logger';
import { ExecuteNode } from '../components/ExecuteNode';
import { ConnectionPanel } from '../components/ConnectionPanel';

interface Props {
  onLogin: (role: Role) => void;
}

const LandingPage: React.FC<Props> = ({ onLogin }) => {
  const wallet = useWallet();
  const [stats, setStats] = useState({
    verifiedCredentials: '...',
    issuers: '...',
    transactions: '...',
  });

  // KYB State
  const [showKybModal, setShowKybModal] = useState(false);
  const [kybStep, setKybStep] = useState<'form' | 'processing' | 'approved'>('form');
  const [kybData, setKybData] = useState({
    entityName: '',
    regId: '',
    jurisdiction: '',
    document: null as File | null,
  });
  const [verificationLogs, setVerificationLogs] = useState<string[]>([]);
  const [particles, setParticles] = useState<{ top: string; left: string; delay: string }[]>([]);
  const [isConnectionPanelOpen, setIsConnectionPanelOpen] = useState(false);

  useEffect(() => {
    getNetworkStats()
      .then(setStats)
      .catch((err) => {
        logger.error('[LandingPage] Failed to fetch network stats:', err);
        setStats({ verifiedCredentials: '...', issuers: '...', transactions: '...' });
      });

    // Generate static particles
    const p = Array.from({ length: 30 }).map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 5}s`,
    }));
    setParticles(p);
  }, []);

  // Mouse parallax for landing cards
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const cards = document.querySelectorAll<HTMLElement>('.landing-card');
      if (cards.length === 0) return;
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      cards.forEach((card, i) => {
        card.style.setProperty('--px', `${(x - 0.5) * (20 + i * 5)}px`);
        card.style.setProperty('--py', `${(y - 0.5) * (20 + i * 5)}px`);
      });
    };
    const onLeave = () => {
      document.querySelectorAll<HTMLElement>('.landing-card').forEach((c) => {
        c.style.setProperty('--px', '0px');
        c.style.setProperty('--py', '0px');
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const handleConnect = async (walletName?: string) => {
    // If specific wallet (e.g. from list), we might want to pass that, but Reown handles it differently.
    // For now, let's open our custom panel which triggers Reown.
    setIsConnectionPanelOpen(true);
  };

  const handleRoleSelect = (role: Role) => {
    if (role === 'issuer') {
      setShowKybModal(true);
    } else {
      onLogin(role);
    }
  };

  const runVerificationSimulation = async () => {
    setKybStep('processing');
    const logs = [
      'Initializing TLS 1.3 Handshake...',
      'Connecting to Oracle Network...',
      `Validating Entity: ${kybData.entityName.toUpperCase()}`,
      'Checking Global Sanctions List...',
      'Verifying LEI Checksum...',
      'Analyzing Documentation (AI Vision)...',
      'Minting Soulbound Token...',
      'Access Granted: ISSUER_NODE',
    ];

    for (let i = 0; i < logs.length; i++) {
      await new Promise((r) => setTimeout(r, 600));
      setVerificationLogs((prev) => [...prev, logs[i]]);
    }

    setTimeout(() => {
      setKybStep('approved');
    }, 500);
  };

  const handleKybSubmit = () => {
    if (!kybData.entityName || !kybData.regId || !kybData.document) return;
    runVerificationSimulation();
  };

  // --------------------------------------------------------------------------
  // RENDER: Role Selection View (After Wallet Connect) — Flash UI Grid
  // --------------------------------------------------------------------------
  if (wallet.address) {
    const roles: {
      role: Role;
      label: string;
      title: string;
      icon: string;
      description: string;
      etchedLine?: React.CSSProperties;
    }[] = [
      {
        role: 'student',
        label: 'User Module 01',
        title: 'STUDENT',
        icon: 'school',
        description:
          'Manage your sovereign identity and academic achievements in a secure digital vault.',
      },
      {
        role: 'issuer',
        label: 'Authority Module 02',
        title: 'ISSUER',
        icon: 'apartment',
        description:
          'Mint cryptographically signed credentials and distribute them to verified participants.',
        etchedLine: {
          background: 'linear-gradient(90deg, transparent, #d946ef, transparent)',
          top: '80%',
        },
      },
      {
        role: 'verifier',
        label: 'Protocol Module 03',
        title: 'VERIFIER',
        icon: 'verified_user',
        description:
          'Validate zero-knowledge proofs and verify authenticity without compromising privacy.',
      },
      {
        role: 'governance',
        label: 'Admin Module 04',
        title: 'GOVERNANCE',
        icon: 'gavel',
        description:
          'Oversee system architecture, adjust protocols, and manage global identity parameters.',
        etchedLine: {
          background: 'linear-gradient(90deg, transparent, #d946ef, transparent)',
          top: '15%',
        },
      },
    ];

    return (
      <div className="min-h-screen relative overflow-hidden cursor-crosshair bg-[#05050a] bg-[radial-gradient(circle_at_20%_30%,rgba(139,0,255,0.15)_0%,transparent_40%),radial-gradient(circle_at_80%_70%,rgba(0,255,255,0.1)_0%,transparent_40%)]">
        {/* SVG Noise Background */}
        <svg className="polymer-bg" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
          <filter id="noiseFilter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#noiseFilter)" />
        </svg>

        {/* Scanline */}
        <div className="scanline-effect" />

        {/* Dashboard Layout */}
        <main className="grid grid-rows-[auto_1fr] min-h-screen p-5 md:p-10 gap-5 md:gap-10 max-w-[1600px] mx-auto relative z-10">
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-5 gap-3">
            <div className="flex flex-col gap-1">
              <div
                className="glitch-header text-[0.8rem] uppercase tracking-[0.4em] text-neon font-mono"
                data-text="IDENTITY UNLOCKED"
              >
                IDENTITY UNLOCKED
              </div>
              <div className="text-xl md:text-[1.8rem] font-bold font-mono bg-gradient-to-r from-white to-primary bg-clip-text text-transparent">
                CONNECTED: {wallet.displayAddress}
              </div>
              {wallet.isMock && (
                <span className="text-[10px] text-amber-500 border border-amber-500/30 px-2 py-0.5 bg-amber-500/10 w-fit">
                  [MOCK]
                </span>
              )}
              {!wallet.isCorrectNetwork && !wallet.isMock && (
                <div className="flex items-center gap-3 mt-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[10px] text-amber-400 font-mono">WRONG NETWORK</span>
                  <button
                    onClick={() => wallet.switchNetwork()}
                    className="text-[10px] font-bold text-amber-500 underline hover:text-amber-400"
                  >
                    SWITCH_TO_AMOY
                  </button>
                </div>
              )}
            </div>
            <div className="font-mono text-[10px] text-magenta/60 hidden md:block">
              CORE_SYSTEM_ACTIVE // VER: 4.0.9
            </div>
          </header>

          {/* 2x2 Action Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 content-start">
            {roles.map((item, index) => (
              <div
                key={item.role}
                className={`landing-card ${index % 2 === 1 ? 'even-card' : ''}`}
                onClick={() => handleRoleSelect(item.role)}
              >
                {/* Etched decorative line */}
                <div className="etched-line-effect" style={item.etchedLine || {}} />

                <div>
                  <div className="flex items-center gap-4 mb-8 md:mb-10">
                    <div className="icon-box-landing">
                      <span className="material-symbols-outlined">{item.icon}</span>
                    </div>
                    <div className="font-mono text-[0.7rem] tracking-[3px] text-white/50 uppercase">
                      {item.label}
                    </div>
                  </div>
                  <h2 className="text-2xl md:text-[2.2rem] font-black uppercase -tracking-wide text-white leading-tight">
                    {item.title}
                  </h2>
                  <p className="text-sm md:text-[1.1rem] text-white/70 mt-3 mb-8 md:mb-10 font-light max-w-[85%] md:max-w-[80%] leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <button className="init-btn-landing">
                  INITIALIZE{' '}
                  <span className="material-symbols-outlined init-arrow">arrow_forward</span>
                </button>
              </div>
            ))}
          </section>
        </main>

        {/* KYB Verification Modal */}
        {showKybModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-2xl obsidian-panel border-magenta/30 overflow-hidden shadow-[0_0_50px_rgba(217,70,239,0.15)]">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-magenta w-6 h-6" />
                  <h3 className="text-xl font-bold font-display text-white tracking-widest uppercase">
                    Institutional Verification
                  </h3>
                </div>
                {kybStep === 'form' && (
                  <button
                    onClick={() => setShowKybModal(false)}
                    className="text-text-muted hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                )}
              </div>

              <div className="p-8">
                {kybStep === 'form' && (
                  <div className="space-y-6 animate-in slide-in-from-right-4">
                    <div className="bg-magenta/10 border border-magenta/20 p-4 mb-6 flex gap-3">
                      <Zap className="w-5 h-5 text-magenta shrink-0" />
                      <p className="text-sm text-magenta font-mono leading-relaxed">
                        Fraud prevention protocols active. Institutional validation required for
                        write access to the ledger.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-text-muted uppercase">
                          Entity Name
                        </label>
                        <input
                          type="text"
                          className="w-full bg-black/50 border border-white/10 p-3 text-white font-mono text-sm focus:border-magenta focus:ring-0"
                          placeholder="University of Polygon"
                          value={kybData.entityName}
                          onChange={(e) => setKybData({ ...kybData, entityName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-text-muted uppercase">
                          Registration ID
                        </label>
                        <input
                          type="text"
                          className="w-full bg-black/50 border border-white/10 p-3 text-white font-mono text-sm focus:border-magenta focus:ring-0"
                          placeholder="LEI-8829-11"
                          value={kybData.regId}
                          onChange={(e) => setKybData({ ...kybData, regId: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-text-muted uppercase">
                          Jurisdiction
                        </label>
                        <select
                          className="w-full bg-black/50 border border-white/10 p-3 text-white font-mono text-sm focus:border-magenta focus:ring-0"
                          value={kybData.jurisdiction}
                          aria-label="Jurisdiction"
                          onChange={(e) => setKybData({ ...kybData, jurisdiction: e.target.value })}
                        >
                          <option value="">Select Region...</option>
                          <option value="US">United States</option>
                          <option value="EU">European Union</option>
                          <option value="APAC">Asia Pacific</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-text-muted uppercase">
                          License Upload
                        </label>
                        <div className="relative">
                          <input
                            type="file"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            aria-label="License Upload"
                            onChange={(e) =>
                              e.target.files &&
                              setKybData({ ...kybData, document: e.target.files[0] })
                            }
                          />
                          <div
                            className={`w-full bg-black/50 border border-dashed ${kybData.document ? 'border-magenta text-magenta' : 'border-white/20 text-text-muted'} p-2.5 text-xs font-mono flex items-center justify-center gap-2 hover:bg-white/5 transition-colors`}
                          >
                            {kybData.document ? (
                              <>
                                <CheckCircle className="w-3 h-3" /> {kybData.document.name}
                              </>
                            ) : (
                              'DRAG_FILE_HERE'
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4">
                      <Button
                        onClick={handleKybSubmit}
                        className="w-full bg-magenta/20 hover:bg-magenta/30 border-magenta/50 text-magenta"
                        disabled={!kybData.entityName || !kybData.regId || !kybData.document}
                      >
                        INITIATE_VERIFICATION_SEQUENCE
                      </Button>
                    </div>
                  </div>
                )}

                {kybStep === 'processing' && (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in">
                    <div className="relative w-32 h-32">
                      <div className="absolute inset-0 rounded-full border-2 border-white/5"></div>
                      <div className="absolute inset-0 rounded-full border-t-2 border-magenta animate-spin"></div>
                      <div className="absolute inset-4 rounded-full border-2 border-white/5"></div>
                      <div className="absolute inset-4 rounded-full border-b-2 border-neon animate-spin direction-reverse duration-1000"></div>
                      <ScanLine className="absolute inset-0 m-auto text-white w-10 h-10 animate-pulse" />
                    </div>

                    <div className="w-full max-w-md bg-black/50 border border-white/10 p-4 font-mono text-xs text-left h-40 overflow-hidden relative">
                      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-transparent to-black/90 z-10"></div>
                      <div className="space-y-2">
                        {verificationLogs.map((log, i) => (
                          <div key={i} className="text-neon">
                            <span className="text-white/30 mr-2">&gt;</span>
                            {log}
                          </div>
                        ))}
                        <div className="text-magenta animate-pulse">_</div>
                      </div>
                    </div>
                  </div>
                )}

                {kybStep === 'approved' && (
                  <div className="py-8 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in duration-300">
                    <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                      <ShieldCheck className="w-12 h-12 text-green-500" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold font-display text-white uppercase tracking-widest">
                        Verified
                      </h2>
                      <p className="text-text-muted font-mono mt-2 text-sm">
                        Identity Anchor Established.
                      </p>
                    </div>

                    <Button onClick={() => onLogin('issuer')} className="w-full max-w-sm mt-4">
                      ENTER_DASHBOARD
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: Landing Page (Hero)
  // --------------------------------------------------------------------------
  return (
    <div className="relative font-body selection:bg-magenta/30 selection:text-white min-h-screen flex flex-col overflow-hidden bg-[#020203]">
      {/* 3D Holographic Grid Background */}
      <div className="holo-grid-container"></div>

      {/* Floating Particles */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {particles.map((p, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full opacity-20 animate-float"
            style={{ top: p.top, left: p.left, animationDelay: p.delay }}
          ></div>
        ))}
      </div>

      {/* Navigation */}
      <nav className="relative z-50 flex items-center justify-end px-6 lg:px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="hidden md:flex items-center gap-8 font-mono text-xs tracking-widest text-slate-400">
          <span className="hover:text-magenta transition-colors cursor-pointer hover:shadow-[0_0_10px_rgba(217,70,239,0.5)]">
            ARCHITECTURE
          </span>
          <span className="hover:text-neon transition-colors cursor-pointer hover:shadow-[0_0_10px_rgba(6,182,212,0.5)]">
            NODES
          </span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]"></span>
            <span className="text-green-400">MAINNET_LIVE</span>
          </div>
          <div className="w-px h-4 bg-glass-edge"></div>
          <ExecuteNode onClick={() => setIsConnectionPanelOpen(true)} />
        </div>
      </nav>

      <ConnectionPanel
        isOpen={isConnectionPanelOpen}
        onClose={() => setIsConnectionPanelOpen(false)}
      />

      <main className="relative z-10 px-6 max-w-7xl mx-auto pt-12 lg:pt-20 pb-32 w-full flex-grow">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Left: Hero Text */}
          <div className="lg:col-span-6 space-y-8">
            <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-neon bg-neon/10 px-4 py-1.5 rounded-full border border-neon/20 shadow-[0_0_15px_rgba(34,211,238,0.1)] animate-in slide-in-from-left-4 duration-700">
              <Hexagon className="w-3 h-3 text-neon animate-spin-slow" />
              Zero-Knowledge Proofs
            </div>

            <h1 className="font-display text-6xl lg:text-[100px] leading-[0.85] font-bold tracking-tighter text-white animate-in slide-in-from-bottom-4 duration-700 delay-100 relative">
              <span className="block glitch-intense" data-text="TRUSTLESS">
                TRUSTLESS
              </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-magenta via-purple-500 to-neon bg-[length:200%_100%] animate-refract block">
                VERACITY
              </span>
            </h1>

            <p className="text-lg text-slate-400 max-w-xl font-light leading-relaxed animate-in slide-in-from-bottom-4 duration-700 delay-200 border-l-2 border-magenta/50 pl-6">
              Deploy sovereign academic credentials on the{' '}
              <span className="text-white font-medium">Morningstar Protocol</span>. Immutable.
              Verifiable. Decentralized.
            </p>

            <div className="flex flex-wrap gap-6 pt-8 animate-in slide-in-from-bottom-4 duration-700 delay-300">
              {wallet.wallets.length > 0 ? (
                // Show detected wallets as connect buttons
                <>
                  {wallet.wallets.map((w) => (
                    <button
                      key={w.name}
                      onClick={() => handleConnect(w.name)}
                      disabled={wallet.isConnecting}
                      className="relative group h-14 px-8 flex items-center justify-center obsidian-panel notch-tl border-magenta/50 hover:border-magenta hover:shadow-[0_0_20px_rgba(217,70,239,0.3)] transition-all overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-magenta/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                      <span className="relative z-10 font-display font-bold text-lg text-white flex items-center gap-3 tracking-wide">
                        <span className="material-symbols-outlined text-magenta">{w.icon}</span>
                        {wallet.isConnecting ? 'INITIALIZING...' : w.name.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </>
              ) : (
                // No wallets detected — show install prompt or mock connect
                <button
                  onClick={() => handleConnect()}
                  disabled={wallet.isConnecting}
                  className="relative group h-14 px-8 flex items-center justify-center obsidian-panel notch-tl border-magenta/50 hover:border-magenta hover:shadow-[0_0_20px_rgba(217,70,239,0.3)] transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-magenta/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                  <span className="relative z-10 font-display font-bold text-lg text-white flex items-center gap-3 tracking-wide">
                    {wallet.isConnecting ? 'INITIALIZING...' : 'DEPLOY_SYSTEM'}
                  </span>
                </button>
              )}

              <button className="h-14 px-8 flex items-center justify-center obsidian-panel notch-br border-white/10 hover:border-neon/50 hover:bg-neon/10 transition-all group">
                <span className="font-mono text-xs tracking-widest text-slate-400 group-hover:text-neon transition-colors">
                  DOCUMENTATION
                </span>
              </button>
            </div>

            {wallet.error && (
              <div className="mt-4 flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-4 py-2 max-w-lg animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-xs text-red-400 font-mono">{wallet.error}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-8 pt-16 border-t border-white/5 max-w-lg animate-in fade-in duration-1000 delay-500">
              <div>
                <div className="text-3xl font-bold font-display tracking-tight text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                  {stats.transactions.includes('M') ? stats.transactions : '2.4M'}
                </div>
                <div className="text-[10px] font-mono text-magenta tracking-widest uppercase mt-1">
                  TRANSACTIONS
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold font-display tracking-tight text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                  {stats.issuers}
                </div>
                <div className="text-[10px] font-mono text-neon tracking-widest uppercase mt-1">
                  NODES
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold font-display tracking-tight text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                  12<span className="text-slate-400 text-sm">ms</span>
                </div>
                <div className="text-[10px] font-mono text-accent tracking-widest uppercase mt-1">
                  LATENCY
                </div>
              </div>
            </div>
          </div>

          {/* Right: Triangle of Trust Visualization */}
          <div className="lg:col-span-6 relative h-[600px] flex items-center justify-center animate-in fade-in duration-1000">
            {/* Neon Connections */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-0"
              viewBox="0 0 600 600"
            >
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Triangle Paths with neon glow */}
              <path
                d="M300 130 L120 450 L480 450 Z"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
                fill="none"
              />

              {/* Animated Data Packets */}
              {/* Issuer -> Holder */}
              <path
                d="M300 130 L120 450"
                stroke="#d946ef"
                strokeWidth="2"
                strokeDasharray="10 200"
                strokeLinecap="round"
                filter="url(#glow)"
                className="animate-[dash_3s_linear_infinite]"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="210"
                  to="0"
                  dur="3s"
                  repeatCount="indefinite"
                />
              </path>

              {/* Holder -> Verifier */}
              <path
                d="M120 450 L480 450"
                stroke="#06b6d4"
                strokeWidth="2"
                strokeDasharray="10 200"
                strokeLinecap="round"
                filter="url(#glow)"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="210"
                  to="0"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </path>

              {/* Verifier -> Issuer (Check) */}
              <path
                d="M480 450 L300 130"
                stroke="#22c55e"
                strokeWidth="2"
                strokeDasharray="10 200"
                strokeLinecap="round"
                filter="url(#glow)"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="210"
                  to="0"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </path>
            </svg>

            {/* Node 1: ISSUER */}
            <div className="absolute top-[10%] left-1/2 -translate-x-1/2 z-20 hover:scale-105 transition-transform duration-500">
              <div className="w-64 glass-panel rounded-xl p-6 text-center border-t border-magenta/50 shadow-[0_0_30px_-10px_rgba(217,70,239,0.3)] relative overflow-hidden group">
                <div className="absolute inset-0 bg-magenta/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-12 h-12 rounded-full bg-black border border-magenta flex items-center justify-center mx-auto mb-4 shadow-[0_0_15px_rgba(217,70,239,0.5)]">
                  <span className="material-symbols-outlined text-magenta">apartment</span>
                </div>
                <h3 className="text-white font-bold font-display tracking-widest text-lg">
                  ISSUER
                </h3>
                <p className="text-[10px] text-magenta font-mono uppercase mt-1">Sign & Anchor</p>
              </div>
            </div>

            {/* Node 2: HOLDER */}
            <div className="absolute bottom-[15%] left-[5%] z-20 hover:scale-105 transition-transform duration-500">
              <div className="w-56 glass-panel rounded-xl p-6 text-center border-t border-neon/50 shadow-[0_0_30px_-10px_rgba(6,182,212,0.3)] relative overflow-hidden group">
                <div className="absolute inset-0 bg-neon/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-10 h-10 rounded-full bg-black border border-neon flex items-center justify-center mx-auto mb-4 shadow-[0_0_15px_rgba(6,182,212,0.5)]">
                  <span className="material-symbols-outlined text-neon">school</span>
                </div>
                <h3 className="text-white font-bold font-display tracking-widest">HOLDER</h3>
                <p className="text-[10px] text-neon font-mono uppercase mt-1">Wallet Storage</p>
              </div>
            </div>

            {/* Node 3: VERIFIER */}
            <div className="absolute bottom-[15%] right-[5%] z-20 hover:scale-105 transition-transform duration-500">
              <div className="w-56 glass-panel rounded-xl p-6 text-center border-t border-green-500/50 shadow-[0_0_30px_-10px_rgba(34,197,94,0.3)] relative overflow-hidden group">
                <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-10 h-10 rounded-full bg-black border border-green-500 flex items-center justify-center mx-auto mb-4 shadow-[0_0_15px_rgba(34,197,94,0.5)]">
                  <span className="material-symbols-outlined text-green-500">verified_user</span>
                </div>
                <h3 className="text-white font-bold font-display tracking-widest">VERIFIER</h3>
                <p className="text-[10px] text-green-500 font-mono uppercase mt-1">Proof Check</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Decorative Overlays */}
      <div className="fixed bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-magenta/5 to-transparent pointer-events-none z-0"></div>
      <div className="fixed top-0 right-0 w-1/3 h-full bg-gradient-to-l from-neon/5 to-transparent pointer-events-none z-0"></div>
    </div>
  );
};

export default LandingPage;
