import React, { useEffect, useState } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useGlitch } from 'react-powerglitch';
import { X, Terminal, Shield, Mail, Wallet } from 'lucide-react';
import { useWallet } from '../services/WalletContext';

interface ConnectionPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ isOpen, onClose }) => {
  const { open } = useAppKit();
  const { isMock } = useWallet();
  const [typedHeader, setTypedHeader] = useState('');
  const headerText = 'SYSTEM_ACCESS // PROTOCOL_INIT';

  // Glitch effect for the panel container
  const panelGlitch = useGlitch({
    playMode: 'always',
    createContainers: true,
    timing: {
      duration: 3000,
      iterations: Infinity,
      easing: 'ease-in-out',
    },
    shake: {
      velocity: 10,
      amplitudeX: 0.01,
      amplitudeY: 0.01,
    },
  });

  // Typewriter effect
  useEffect(() => {
    if (isOpen) {
      let i = 0;
      const timer = setInterval(() => {
        setTypedHeader(headerText.slice(0, i));
        i++;
        if (i > headerText.length) clearInterval(timer);
      }, 50);
      return () => clearInterval(timer);
    } else {
      setTypedHeader('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    // Standard Reown Logic
    await open();
    // Reown modal handles Google, Email, WalletConnect internal logic
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        ref={panelGlitch.ref}
        className="relative w-full max-w-md bg-black border-2 border-[#00ff41] shadow-[0_0_30px_rgba(0,255,65,0.3)] overflow-hidden [clip-path:polygon(0_0,100%_0,100%_95%,95%_100%,0_100%)]"
      >
        {/* CRT Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-[1] bg-[length:100%_2px,3px_100%] pointer-events-none" />

        {/* Header */}
        <div className="bg-[#001a05] border-b border-[#00ff41] p-4 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-2 text-[#00ff41]">
            <Terminal className="w-5 h-5" />
            <span className="font-mono font-bold tracking-widest">
              {typedHeader}
              <span className="animate-pulse">_</span>
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Panel"
            className="text-[#00ff41] hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 relative z-10">
          <div className="space-y-4">
            <button
              onClick={() => open({ view: 'Connect' })}
              className="w-full group relative px-6 py-4 bg-[#001a05] border border-[#00ff41]/50 hover:border-[#00ff41] transition-all duration-300 text-left"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-[#00ff41]/10 rounded border border-[#00ff41]/30 group-hover:bg-[#00ff41] group-hover:text-black transition-colors">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[#00ff41] font-mono font-bold text-lg">
                    INITIALIZE_WALLET
                  </div>
                  <div className="text-[#00ff41]/60 text-xs font-mono">
                    Connect existing wallet (Metamask, Rabby, etc)
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => open({ view: 'Connect' })} // Reown unified modal handles social
              className="w-full group relative px-6 py-4 bg-[#001a05] border border-[#00ff41]/50 hover:border-[#00ff41] transition-all duration-300 text-left"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-[#00ff41]/10 rounded border border-[#00ff41]/30 group-hover:bg-[#00ff41] group-hover:text-black transition-colors">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[#00ff41] font-mono font-bold text-lg">
                    SOCIAL_AUTH_PROTOCOL
                  </div>
                  <div className="text-[#00ff41]/60 text-xs font-mono">
                    Google Identity Verification
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => open({ view: 'Connect' })} // Trigger generic connect, usually email input is there
              className="w-full group relative px-6 py-4 bg-[#001a05] border border-[#00ff41]/50 hover:border-[#00ff41] transition-all duration-300 text-left"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-[#00ff41]/10 rounded border border-[#00ff41]/30 group-hover:bg-[#00ff41] group-hover:text-black transition-colors">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[#00ff41] font-mono font-bold text-lg">
                    EMAIL_LINK_ACCESS
                  </div>
                  <div className="text-[#00ff41]/60 text-xs font-mono">
                    Supports Disposable & Standard Relays
                  </div>
                </div>
              </div>
            </button>
          </div>

          <div className="text-[#00ff41]/40 text-xs font-mono text-center border-t border-[#00ff41]/20 pt-4">
            SECURE_CONNECTION_ESTABLISHED // ENCRYPTED_CHANNEL_ACTIVE
          </div>
        </div>
      </div>
    </div>
  );
};
