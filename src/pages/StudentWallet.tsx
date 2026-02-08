import React, { useEffect, useState } from 'react';
import { fetchCredentials } from '../services/mockBlockchain';
import { useWallet } from '../services/WalletContext';
import { Credential, MOCK_DID } from '../types';
import { Badge, Button, Modal, Card, GlitchText } from '../components/UI';
import { Loader2, Shield, Share2, Eye, Lock, ExternalLink, Camera, Calendar, Hash, User, Activity, ScanLine, Copy, Check, Unlock } from 'lucide-react';
import { logger } from '../services/logger';

const StudentWallet: React.FC = () => {
  const wallet = useWallet();

  // Registration Flow State
  const [isRegistered, setIsRegistered] = useState(false);
  const [regStep, setRegStep] = useState<'welcome' | 'wallet' | 'profile' | 'generating' | 'success'>('welcome');
  const [regData, setRegData] = useState({ name: '', email: '', walletAddress: '' });
  const [isConnecting, setIsConnecting] = useState(false);
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  
  // Dashboard State
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCred, setSelectedCred] = useState<Credential | null>(null);
  const [detailsCred, setDetailsCred] = useState<Credential | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionSuccess, setDecryptionSuccess] = useState(false); // New state for visual feedback
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanningState, setScanningState] = useState<'camera' | 'found' | 'claimed'>('camera');
  const [hiddenAttributes, setHiddenAttributes] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // VP Session Timer
  const [expiryTimer, setExpiryTimer] = useState(300);

  useEffect(() => {
    fetchCredentials()
      .then(data => setCredentials(data))
      .catch(err => {
        logger.error('[StudentWallet] Failed to fetch credentials:', err);
        setCredentials([]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Timer Logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isShareModalOpen) {
      setExpiryTimer(300); // Reset to 5 minutes
      interval = setInterval(() => {
        setExpiryTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isShareModalOpen]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Registration Handlers ---
  const handleConnectWallet = async (walletName?: string) => {
    setIsConnecting(true);
    try {
      const addr = await wallet.connect(walletName);
      if (addr) {
        setRegData(prev => ({ ...prev, walletAddress: addr }));
        setRegStep('profile');
      }
    } catch (e) {
      logger.error('[StudentWallet] Wallet connection failed', e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCreateDID = async () => {
    if (!regData.name) return;
    setRegStep('generating');
    setGenerationLogs([]);
    
    const steps = [
       "Initializing cryptographic module...",
       "Generating RSA-2048 Keypair...",
       "Deriving public key from signature...",
       "Constructing DID Document...",
       "Anchoring DID to Polygon PoS...",
       "Verifying transaction receipt..."
    ];

    for (const step of steps) {
        await new Promise(resolve => setTimeout(resolve, 800));
        setGenerationLogs(prev => [...prev, step]);
    }

    setRegStep('success');
  };

  // --- Dashboard Handlers ---
  const openShare = (c: Credential, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedCred(c);
    setHiddenAttributes({});
    setIsShareModalOpen(true);
  };

  const openDetails = (c: Credential) => {
    setDetailsCred(c);
    setIsDecrypting(true);
    setDecryptionSuccess(false);
    // Simulate decryption delay for effect
    setTimeout(() => {
      setIsDecrypting(false);
      setDecryptionSuccess(true);
    }, 1500);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleAttributePrivacy = (key: string) => {
    setHiddenAttributes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const scanTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const handleScanClaim = () => {
    setScanningState('camera');
    setIsScanModalOpen(true);

    // Clear any previous scan timers
    scanTimers.current.forEach(t => clearTimeout(t));
    scanTimers.current = [];

    const t1 = setTimeout(() => {
      setScanningState('found');
      const t2 = setTimeout(() => {
         setScanningState('claimed');
         const newCred: Credential = {
             id: "vc-" + Math.floor(Math.random() * 10000),
             type: "Blockchain Architecture Certification",
             issuer: "Morningstar Academy",
             issuanceDate: new Date().toISOString().split('T')[0],
             recipient: regData.walletAddress ? `did:poly:${regData.walletAddress.slice(0,8)}` : MOCK_DID,
             status: 'active',
             data: { competency: "Smart Contract Security", score: "98/100", auditor: "CertiK", licenseNumber: "MS-2024-8821" },
             hiddenData: { internalId: "INT-992-X", examinerNotes: "Excellent practical demo" }
         };
         setCredentials(prev => [newCred, ...prev]);
      }, 1500);
      scanTimers.current.push(t2);
    }, 2000);
    scanTimers.current.push(t1);
  };

  // Cleanup scan timers on unmount
  useEffect(() => {
    return () => {
      scanTimers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // --- RENDER: Registration Flow ---
  if (!isRegistered) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className="max-w-md w-full glass-panel cyber-corner p-8">
          {regStep === 'welcome' && (
            <div className="text-center space-y-6 animate-in fade-in">
              <div className="w-20 h-20 mx-auto border border-highlight/50 rounded-full flex items-center justify-center bg-highlight/10 shadow-neon-magenta">
                <span className="material-symbols-outlined text-4xl text-highlight">person_add</span>
              </div>
              <h2 className="text-3xl font-bold text-white font-display tracking-tight">
                <GlitchText text="IDENTITY_INIT" />
              </h2>
              <p className="text-text-muted font-light">Establish your Self-Sovereign Identity on the network.</p>
              <Button className="w-full" onClick={() => setRegStep('wallet')}>START_SEQUENCE</Button>
            </div>
          )}

          {regStep === 'wallet' && (
            <div className="space-y-6 animate-in slide-in-from-right-8">
               <h3 className="text-xl font-bold text-white font-display border-b border-white/10 pb-2">
                 <GlitchText text="LINK_WALLET" />
               </h3>
               {wallet.wallets.length > 0 ? (
                 <div className="space-y-3">
                   {wallet.wallets.map((w) => (
                     <button key={w.name} onClick={() => handleConnectWallet(w.name)} disabled={isConnecting} className="w-full p-4 border border-white/10 bg-white/5 flex items-center gap-4 hover:border-primary hover:bg-white/10 transition-all group">
                       <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                         <span className="material-symbols-outlined text-primary">{w.icon}</span>
                       </div>
                       <div className="text-left flex-1">
                          <div className="font-bold text-white font-mono">{w.name}</div>
                          <div className="text-xs text-text-muted">EIP-1193 Provider</div>
                       </div>
                       {isConnecting && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                     </button>
                   ))}
                 </div>
               ) : (
                 <button onClick={() => handleConnectWallet()} disabled={isConnecting} className="w-full p-4 border border-white/10 bg-white/5 flex items-center gap-4 hover:border-primary hover:bg-white/10 transition-all group">
                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-orange-500 font-bold">
                      <span className="material-symbols-outlined">account_balance_wallet</span>
                    </div>
                    <div className="text-left flex-1">
                       <div className="font-bold text-white font-mono">{wallet.isMock ? 'Demo Wallet' : 'Connect Wallet'}</div>
                       <div className="text-xs text-text-muted">{wallet.isMock ? 'Mock Mode — No extension detected' : 'Browser Extension'}</div>
                    </div>
                    {isConnecting && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                 </button>
               )}
               {wallet.error && (
                 <div className="text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/30 px-3 py-2">{wallet.error}</div>
               )}
               <Button variant="outline" className="w-full" onClick={() => setRegStep('welcome')}>BACK</Button>
            </div>
          )}

          {regStep === 'profile' && (
            <div className="space-y-6 animate-in slide-in-from-right-8">
               <div className="flex items-center gap-2 mb-2 px-3 py-1 bg-white/5 border border-white/10 w-fit">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <span className="text-xs font-mono text-text-muted">{regData.walletAddress.substring(0,10)}...</span>
               </div>
               <h3 className="text-xl font-bold text-white font-display">
                 <GlitchText text="PROFILE_CONFIG" />
               </h3>
               <div className="space-y-4">
                  <div>
                     <label className="block text-xs font-mono text-text-muted mb-1 uppercase">Full Name</label>
                     <input type="text" className="w-full bg-black/40 border border-white/10 focus:border-highlight text-white p-2 font-mono" placeholder="Jane Doe" value={regData.name} onChange={(e) => setRegData({...regData, name: e.target.value})} />
                  </div>
                  <div>
                     <label className="block text-xs font-mono text-text-muted mb-1 uppercase">Email</label>
                     <input type="email" className="w-full bg-black/40 border border-white/10 focus:border-highlight text-white p-2 font-mono" placeholder="jane@example.com" value={regData.email} onChange={(e) => setRegData({...regData, email: e.target.value})} />
                  </div>
               </div>
               <Button className="w-full" onClick={handleCreateDID} disabled={!regData.name}>MINT_DID</Button>
            </div>
          )}

          {regStep === 'generating' && (
             <div className="text-center py-8">
                <div className="relative w-20 h-20 mx-auto mb-6">
                   <div className="absolute inset-0 rounded-full border-2 border-white/10"></div>
                   <div className="absolute inset-0 rounded-full border-t-2 border-highlight animate-spin"></div>
                   <ScanLine className="absolute inset-0 m-auto text-white w-8 h-8 animate-pulse" />
                </div>
                
                <h3 className="text-lg font-bold text-white font-display tracking-widest uppercase mb-6">Minting Identity</h3>
                
                <div className="bg-black/40 border border-white/10 p-3 text-left font-mono text-xs h-32 overflow-hidden flex flex-col justify-end">
                   {generationLogs.map((log, i) => (
                      <div key={i} className="text-highlight animate-in slide-in-from-left-2">
                         <span className="text-white/30 mr-2">&gt;</span>{log}
                      </div>
                   ))}
                   <div className="animate-pulse text-highlight">_</div>
                </div>
             </div>
          )}

          {regStep === 'success' && (
             <div className="text-center py-4 animate-in zoom-in duration-300">
                <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)] mx-auto mb-6">
                   <Shield className="w-10 h-10 text-green-500" />
                </div>
                <h3 className="text-2xl font-bold text-white font-display">
                    <GlitchText text="ACCESS GRANTED" intensity="intense" />
                </h3>
                <div className="bg-white/5 p-4 border border-white/10 my-6 text-left relative overflow-hidden group">
                   <div className="absolute top-0 right-0 p-1 opacity-20"><Shield className="w-12 h-12" /></div>
                   <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Your DID</div>
                   <div className="font-mono text-xs text-white break-all">did:polygon:{regData.walletAddress}</div>
                </div>
                <Button className="w-full" onClick={() => setIsRegistered(true)}>ENTER_VAULT</Button>
             </div>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER: Main Dashboard ---
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="glass-panel p-8 cyber-corner flex flex-col md:flex-row justify-between items-center gap-6">
         <div className="flex items-center gap-6">
           <div className="w-20 h-20 bg-gradient-to-br from-highlight to-primary rounded-none flex items-center justify-center text-3xl font-bold text-white border border-white/20 shadow-neon-magenta">
             {regData.name ? regData.name.charAt(0).toUpperCase() : 'J'}
           </div>
           <div>
             <h1 className="text-3xl font-bold text-white font-display tracking-wide uppercase">{regData.name || "John Doe"}</h1>
             <div className="flex items-center gap-2 mt-2">
                <span className="font-mono text-xs text-text-muted bg-white/5 px-2 py-1 border border-white/10 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">fingerprint</span>
                  {regData.walletAddress ? `${regData.walletAddress.substring(0,6)}...${regData.walletAddress.substring(38)}` : MOCK_DID}
                </span>
                <Badge status="Verified Holder" />
             </div>
           </div>
         </div>
         <div className="flex gap-3">
            <Button variant="outline" onClick={handleScanClaim}>SCAN_QR</Button>
            <Button>EXPORT_DATA</Button>
         </div>
      </div>

      <div className="flex items-center justify-between border-b border-white/5 pb-2">
         <h2 className="text-xl font-bold text-white flex items-center gap-2 font-display">
            <span className="material-symbols-outlined text-data">folder_shared</span>
            <GlitchText text="CREDENTIAL_VAULT" intensity="intense" />
         </h2>
         <span className="text-xs font-mono text-text-muted">[{credentials.length}] ASSETS_SECURED</span>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {credentials.map(cred => (
            <div 
              key={cred.id} 
              onClick={() => openDetails(cred)}
              className="group relative glass-panel p-0 overflow-hidden hover:border-highlight/50 transition-all cursor-pointer hover:-translate-y-1"
            >
               <div className="h-32 bg-gradient-to-br from-primary/20 to-transparent p-6 flex flex-col justify-between border-b border-white/5 relative">
                  <div className="absolute top-0 right-0 p-2">
                    <Badge status={cred.status === 'active' ? 'Verified' : (cred.status === 'revoked' ? 'Revoked' : cred.status)} />
                  </div>
                  <div className="w-10 h-10 bg-black/40 border border-white/10 flex items-center justify-center rounded-none">
                     <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                     <p className="text-highlight text-[10px] font-mono uppercase tracking-widest">{cred.issuer}</p>
                     <h3 className="text-white font-bold text-lg leading-tight mt-1 font-display">{cred.type}</h3>
                  </div>
               </div>
               <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    {Object.entries(cred.data).slice(0, 3).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs group-hover:bg-white/5 p-1 transition-colors border-b border-dashed border-white/5 pb-1">
                        <span className="text-text-muted font-mono uppercase">{k}</span>
                        <span className="font-bold text-white text-right truncate max-w-[120px]">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                     <button onClick={(e) => openShare(cred, e)} className="flex-1 bg-white/5 hover:bg-highlight/20 border border-white/10 hover:border-highlight text-xs font-bold py-2 text-white transition-colors uppercase">Present</button>
                     <button className="flex-1 bg-white/5 hover:bg-data/20 border border-white/10 hover:border-data text-xs font-bold py-2 text-white transition-colors uppercase">Proof</button>
                  </div>
               </div>
            </div>
          ))}
        </div>
      )}

      {/* Details Modal */}
      <Modal isOpen={!!detailsCred} onClose={() => setDetailsCred(null)} title="ASSET_DETAILS">
        {detailsCred && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-primary/10 border border-primary/30 relative overflow-hidden">
              <div className="absolute inset-0 bg-cyber-grid opacity-10"></div>
              <div className="w-16 h-16 bg-black border border-white/10 flex items-center justify-center relative z-10 shadow-[0_0_15px_rgba(139,92,246,0.5)]">
                  <Shield className="w-8 h-8 text-primary" />
              </div>
              <div className="relative z-10 flex-1">
                  <h4 className="font-bold text-white text-2xl font-display uppercase tracking-wide">{detailsCred.type}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="material-symbols-outlined text-xs text-text-muted">apartment</span>
                    <p className="text-xs text-text-muted font-mono uppercase tracking-wider">{detailsCred.issuer}</p>
                  </div>
              </div>
              <Badge status={detailsCred.status} />
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono border-b border-white/5 pb-6">
              <div className="space-y-1 bg-white/5 p-3 border border-white/5 hover:border-white/10 transition-colors group relative">
                 <button onClick={() => copyToClipboard(detailsCred.recipient, 'recipient')} className="absolute top-2 right-2 text-text-muted hover:text-white"><Copy className="w-3 h-3"/></button>
                 <span className="text-text-muted flex items-center gap-2 uppercase tracking-wider"><User className="w-3 h-3 text-highlight"/> Issued To</span>
                 <span className="text-white break-all block truncate text-[10px] mt-1" title={detailsCred.recipient}>{detailsCred.recipient.substring(0, 24)}...</span>
                 {copiedId === 'recipient' && <span className="absolute bottom-1 right-1 text-[8px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3"/> Copied</span>}
              </div>
              <div className="space-y-1 bg-white/5 p-3 border border-white/5 hover:border-white/10 transition-colors">
                <span className="text-text-muted flex items-center gap-2 uppercase tracking-wider"><Calendar className="w-3 h-3 text-highlight"/> Issued On</span>
                <span className="text-white block mt-1 font-bold">{detailsCred.issuanceDate}</span>
              </div>
              <div className="space-y-1 bg-white/5 p-3 border border-white/5 hover:border-white/10 transition-colors group relative">
                 <button onClick={() => copyToClipboard(detailsCred.id, 'id')} className="absolute top-2 right-2 text-text-muted hover:text-white"><Copy className="w-3 h-3"/></button>
                 <span className="text-text-muted flex items-center gap-2 uppercase tracking-wider"><Hash className="w-3 h-3 text-highlight"/> Asset ID</span>
                 <span className="text-white block mt-1">{detailsCred.id}</span>
                 {copiedId === 'id' && <span className="absolute bottom-1 right-1 text-[8px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3"/> Copied</span>}
              </div>
              <div className="space-y-1 bg-white/5 p-3 border border-white/5 hover:border-white/10 transition-colors">
                 <span className="text-text-muted flex items-center gap-2 uppercase tracking-wider"><Activity className="w-3 h-3 text-highlight"/> Current Status</span>
                 <div className="mt-1"><Badge status={detailsCred.status} /></div>
              </div>
            </div>

            <div>
              <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-3 font-display flex items-center gap-2">
                <span className="w-1 h-4 bg-primary"></span>
                Public Attributes
              </h5>
              <div className="grid grid-cols-1 gap-2">
                  {Object.entries(detailsCred.data).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center p-3 bg-white/5 border-l-2 border-l-white/20 border-t border-t-white/5 border-b border-b-white/5 border-r border-r-white/5 hover:bg-white/10 hover:border-l-primary transition-all">
                        <span className="text-xs font-mono text-text-muted uppercase tracking-tight">{key}</span>
                        <span className="text-sm font-bold text-white text-right">{value}</span>
                    </div>
                  ))}
              </div>

              {detailsCred.hiddenData && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                      <h5 className="text-xs font-bold text-highlight uppercase tracking-wider font-display flex items-center gap-2">
                        <span className={`w-1 h-4 bg-highlight ${isDecrypting ? 'animate-pulse' : ''}`}></span>
                        Encrypted Attributes (Private)
                      </h5>
                      {decryptionSuccess && !isDecrypting && (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-green-400 border border-green-500/30 px-2 py-0.5 rounded bg-green-500/10">
                              <Unlock className="w-3 h-3" /> UNLOCKED
                          </span>
                      )}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {isDecrypting ? (
                      <div className="p-8 border border-dashed border-highlight/30 bg-highlight/5 flex flex-col items-center justify-center gap-3 animate-pulse">
                        <Loader2 className="w-6 h-6 text-highlight animate-spin" />
                        <span className="text-xs font-mono text-highlight">DECRYPTING_SECURE_ENCLAVE...</span>
                        <div className="h-1 w-24 bg-highlight/20 rounded-full overflow-hidden">
                            <div className="h-full bg-highlight w-1/2 animate-[scan_1s_infinite_linear]"></div>
                        </div>
                      </div>
                    ) : (
                      Object.entries(detailsCred.hiddenData).map(([key, value]) => (
                        <div key={key} className={`flex justify-between items-center p-3 bg-black/40 border border-dashed ${decryptionSuccess ? 'border-green-500/30 hover:border-green-400' : 'border-highlight/30 hover:border-highlight'} hover:shadow-[0_0_10px_rgba(217,70,239,0.1)] transition-all group animate-in slide-in-from-bottom-2 duration-500`}>
                            <span className="text-xs font-mono text-text-muted uppercase flex items-center gap-2 group-hover:text-highlight transition-colors">
                              {decryptionSuccess ? <Unlock className="w-3 h-3 text-green-400" /> : <Lock className="w-3 h-3" />} {key}
                            </span>
                            <div className="flex items-center gap-3">
                                <span className={`text-sm font-bold text-white ${decryptionSuccess ? 'text-green-50' : 'blur-sm select-none'}`}>{value}</span>
                                <span className="text-[10px] font-mono text-highlight border border-highlight/30 px-1.5 py-0.5 bg-highlight/10 rounded-sm">CONFIDENTIAL</span>
                            </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-black/60 p-4 border border-white/10 font-mono text-[10px] space-y-1 relative overflow-hidden rounded">
                <div className="absolute top-0 right-0 p-2 opacity-10"><Shield className="w-16 h-16" /></div>
                <div className="flex justify-between border-b border-white/5 pb-1 mb-1"><span className="text-text-muted">BLOCKCHAIN_NET</span><span className="text-primary">POLYGON_POS</span></div>
                <div className="flex justify-between border-b border-white/5 pb-1 mb-1"><span className="text-text-muted">MERKLE_ROOT</span><span className="text-green-400">0x7f83b1...a923</span></div>
                <div className="flex justify-between"><span className="text-text-muted">ANCHOR_TX</span><span className="text-data underline decoration-dotted cursor-pointer hover:text-white">0x88...12 <ExternalLink className="w-2 h-2 inline"/></span></div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDetailsCred(null)}>CLOSE</Button>
              <Button className="flex-1" onClick={() => { setDetailsCred(null); openShare(detailsCred); }}>SHARE_VP</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Selective Disclosure Modal */}
      <Modal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} title="GENERATE_VP">
        {selectedCred && (
          <div className="space-y-6">
            <div className="bg-highlight/10 border border-highlight/30 p-4 text-xs text-white flex gap-3">
              <Shield className="w-5 h-5 shrink-0 text-highlight" />
              <div>
                <strong className="block mb-1 font-display uppercase tracking-wide">Zero-Knowledge Disclosure</strong>
                Select attributes to reveal. Unchecked items remain cryptographically hidden.
              </div>
            </div>
            
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {Object.entries(selectedCred.data).map(([key, val]) => (
                <div 
                   key={key} 
                   onClick={() => toggleAttributePrivacy(key)}
                   className={`flex items-center justify-between p-3 border cursor-pointer transition-all ${hiddenAttributes[key] ? 'bg-black/40 border-white/5 opacity-50' : 'bg-green-900/10 border-green-500/30'}`}
                >
                  <div className="flex flex-col">
                     <span className={`text-xs font-mono uppercase ${hiddenAttributes[key] ? 'text-text-muted line-through' : 'text-white'}`}>{key}</span>
                     <span className="text-xs text-text-muted">{val}</span>
                  </div>
                  <div className={`w-3 h-3 border ${hiddenAttributes[key] ? 'border-white/30 bg-transparent' : 'bg-green-500 border-green-500 shadow-[0_0_8px_#22c55e]'}`}></div>
                </div>
              ))}
            </div>

            {/* New Controls */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/10 p-3 flex items-center gap-3">
                     <div className="p-2 bg-orange-500/10 rounded border border-orange-500/30">
                        <span className="material-symbols-outlined text-orange-500 text-lg">timer</span>
                     </div>
                     <div>
                        <div className="text-[10px] font-mono text-text-muted uppercase">Session Expiry</div>
                        <div className="font-bold text-white font-mono">{formatTime(expiryTimer)} <span className="text-xs text-text-muted">MIN</span></div>
                     </div>
                </div>
                <div className="bg-white/5 border border-white/10 p-3 flex items-center gap-3">
                     <div className="p-2 bg-blue-500/10 rounded border border-blue-500/30">
                        <span className="material-symbols-outlined text-blue-500 text-lg">link</span>
                     </div>
                     <div>
                        <div className="text-[10px] font-mono text-text-muted uppercase">Link Type</div>
                        <div className="font-bold text-white font-mono">ONE-TIME</div>
                     </div>
                </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-white/5">
               <Button variant="danger" className="flex-1" onClick={() => { setIsShareModalOpen(false); alert("Access Revoked for previous sessions."); }}>
                  REVOKE_ACCESS
               </Button>
               <Button className="flex-[2]" onClick={() => { setIsShareModalOpen(false); alert("Proof Generated"); }}>
                  SIGN_&_SHARE
               </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* QR Scanner */}
      <Modal isOpen={isScanModalOpen} onClose={() => setIsScanModalOpen(false)} title="SCAN_INTERFACE">
        <div className="text-center py-6">
          {scanningState === 'camera' && (
            <div className="flex flex-col items-center">
               <div className="w-64 h-64 bg-black border-2 border-white/20 relative overflow-hidden mb-6 cyber-corner">
                  <div className="absolute inset-0 bg-highlight/20 animate-pulse"></div>
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-highlight shadow-[0_0_15px_#ff00ff] animate-[scan_2s_ease-in-out_infinite]"></div>
                  <Camera className="w-12 h-12 text-white/50 absolute inset-0 m-auto" />
               </div>
               <p className="text-text-muted font-mono text-xs animate-pulse">SEARCHING_FOR_QR_SIGNAL...</p>
            </div>
          )}
          {scanningState === 'found' && (
             <div className="flex flex-col items-center py-8">
                <Loader2 className="w-16 h-16 text-highlight animate-spin mb-6" />
                <h3 className="font-bold text-white text-lg font-display">SIGNAL DETECTED</h3>
                <p className="text-text-muted text-xs font-mono mt-2">Verifying Anchor...</p>
             </div>
          )}
          {scanningState === 'claimed' && (
             <div className="flex flex-col items-center py-4">
                <span className="material-symbols-outlined text-6xl text-green-500 mb-6 glow-icon">verified</span>
                <h3 className="font-bold text-white text-xl font-display">ASSET SECURED</h3>
                <Button onClick={() => setIsScanModalOpen(false)} className="w-full mt-8">RETURN_TO_VAULT</Button>
             </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default StudentWallet;