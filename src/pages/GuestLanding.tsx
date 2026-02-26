import React from 'react';
import { ExecuteNode } from '../components/ExecuteNode';
import { ShieldCheck, Zap, Globe2 } from 'lucide-react';

interface Props {
  onConnectIntent: () => void;
  onWarmupIntent?: () => void;
}

const GuestLanding: React.FC<Props> = ({ onConnectIntent, onWarmupIntent }) => (
  <div className="min-h-screen relative overflow-hidden bg-[#05050a]">
    <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(139,92,246,0.2),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(6,182,212,0.18),transparent_45%)] pointer-events-none" />
    <div className="holo-grid-container" />
    <div className="scanline-effect" />

    <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <section className="glass-panel cyber-corner p-8 sm:p-12 border border-primary/25">
        <p className="text-[11px] tracking-[0.25em] uppercase font-mono text-data mb-4">
          Morningstar Credentials Protocol
        </p>
        <h1 className="font-display text-3xl sm:text-5xl font-bold leading-tight text-white">
          Verifiable Credentials
          <span className="block text-highlight">Built For Real-World Trust</span>
        </h1>
        <p className="mt-6 text-text-muted max-w-2xl">
          Issue, verify, and govern academic credentials with W3C-compatible identity standards
          and tamper-evident records.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 sm:items-center">
          <ExecuteNode onClick={onConnectIntent} onWarmup={onWarmupIntent} />
          <p className="text-xs font-mono tracking-wider uppercase text-data/70">
            Connect wallet to initialize secure modules
          </p>
        </div>
      </section>

      <section className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        <article className="glass-panel p-5 border border-white/10">
          <ShieldCheck className="w-5 h-5 text-highlight mb-3" />
          <h2 className="text-sm font-display font-bold text-white mb-1">Integrity</h2>
          <p className="text-xs text-text-muted">Cryptographic verification and immutable audit history.</p>
        </article>
        <article className="glass-panel p-5 border border-white/10">
          <Zap className="w-5 h-5 text-data mb-3" />
          <h2 className="text-sm font-display font-bold text-white mb-1">Performance</h2>
          <p className="text-xs text-text-muted">Optimized load path with adaptive effects by device capability.</p>
        </article>
        <article className="glass-panel p-5 border border-white/10">
          <Globe2 className="w-5 h-5 text-primary mb-3" />
          <h2 className="text-sm font-display font-bold text-white mb-1">Interoperability</h2>
          <p className="text-xs text-text-muted">Designed for modern browsers and cross-device workflows.</p>
        </article>
      </section>
    </main>
  </div>
);

export default GuestLanding;
