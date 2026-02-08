import React, { useState, useRef, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Button, Card, Badge, Modal, GlitchText } from '../components/UI';
import { generateSchemaWithGemini } from '../services/geminiService';
import { credentialSchemaRegistry } from '../services/credentialSchema';
import { statusListService } from '../services/statusList';
import { governanceRegistry } from '../services/governanceRegistry';
import { mockSignTransaction, fetchDashboardStats } from '../services/mockBlockchain';
import { useWallet } from '../services/WalletContext';
import { SchemaTemplate } from '../types';
import { Loader, Download, QrCode, Shield, Lock, Building, FileText, Globe, Upload, CheckCircle, Activity, ShieldAlert, Printer, Edit3, AlertTriangle } from 'lucide-react';
import QRCode from 'qrcode';
import { logger } from '../services/logger';

interface Props {
  isSystemPaused: boolean;
}

const UniversityDashboard: React.FC<Props> = ({ isSystemPaused }) => {
  const walletCtx = useWallet();
  const issuerDid = 'did:web:polygon.university';
  const [activeTab, setActiveTab] = useState<'overview' | 'schema' | 'issue' | 'revoke'>('overview');
  
  // Dashboard Stats
  const [stats, setStats] = useState<{
    totalIssued: number;
    pendingVerifications: number;
    activeSchemas: number;
    chartData: any[];
  } | null>(null);

  // KYB / Production Lock State
  const [kybStatus, setKybStatus] = useState<'unverified' | 'processing' | 'verified'>('unverified');
  const [isKybModalOpen, setIsKybModalOpen] = useState(false);
  const [kybData, setKybData] = useState({ name: '', regId: '', jurisdiction: 'US', file: null as File | null });
  const [kybLogs, setKybLogs] = useState<string[]>([]);

  // Schema State
  const [schemaPrompt, setSchemaPrompt] = useState('');
  const [generatedSchema, setGeneratedSchema] = useState<SchemaTemplate | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Issue State
  const [issueStep, setIssueStep] = useState<'idle' | 'signing_1' | 'waiting_2' | 'signing_2' | 'anchoring' | 'complete'>('idle');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [issuedBatch, setIssuedBatch] = useState<{id: string, name: string, did: string, degree: string}[]>([]);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  
  useEffect(() => {
    fetchDashboardStats().then(setStats);

    // Simulate Real-Time Live Feed
    const interval = setInterval(() => {
      setStats(prev => {
        if (!prev) return null;
        
        // Clone data
        const newChartData = [...prev.chartData];
        const lastIndex = newChartData.length - 1;
        
        // Randomly increment 'issued' count for the current day (simulating live activity)
        if (Math.random() > 0.5) {
            const updatedDay = { ...newChartData[lastIndex], issued: newChartData[lastIndex].issued + 1 };
            newChartData[lastIndex] = updatedDay;
            return {
                ...prev,
                totalIssued: prev.totalIssued + 1,
                chartData: newChartData
            };
        }
        return prev;
      });
    }, 3000); // Check for updates every 3 seconds

    return () => clearInterval(interval);
  }, []);

  // Handlers
  const handleRunKyb = async () => {
    if (!kybData.name || !kybData.regId || !kybData.file) return;
    setKybStatus('processing');
    setKybLogs([]);

    const steps = [
        "Initializing Secure Handshake (TLS 1.3)...",
        `Querying Global LEI Index for ${kybData.name}...`,
        "Analyzing Corporate Structure & UBO...",
        "Validating Business License via Oracle...",
        "Checking OFAC/Sanctions Lists...",
        "Minting Soulbound Authority Token...",
        "ISSUER_ROLE Grant: APPROVED"
    ];

    for (const step of steps) {
        setKybLogs(prev => [...prev, step]);
        await new Promise(r => setTimeout(r, 1000));
    }

    setTimeout(() => {
        setKybStatus('verified');
        setIsKybModalOpen(false);
    }, 1000);
  };

  const handleGenerateSchema = async () => {
    if (!schemaPrompt) return;
    setIsGenerating(true);
    try {
      const schema = await generateSchemaWithGemini(schemaPrompt);
      setGeneratedSchema(schema);
    } catch (e) {
      setGeneratedSchema({
        schemaName: "Academic Certificate",
        fields: [
          { name: "studentName", type: "string", required: true },
          { name: "degree", type: "string", required: true },
          { name: "graduationDate", type: "date", required: true },
          { name: "dateIssued", type: "date", required: true }
        ]
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportSchema = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.schemaName && Array.isArray(json.fields)) {
          setGeneratedSchema(json);
        } else {
          alert("Invalid schema format.");
        }
      } catch (error) {
        alert("Error parsing JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFieldChange = (index: number, key: string, value: any) => {
    if (!generatedSchema) return;
    const newFields = [...generatedSchema.fields];
    (newFields[index] as any)[key] = value;
    setGeneratedSchema({ ...generatedSchema, fields: newFields });
  };

  const handleAddField = () => {
    if (!generatedSchema) {
      setGeneratedSchema({ schemaName: "New Schema", fields: [] });
    }
    setGeneratedSchema(prev => ({
      schemaName: prev?.schemaName || "New Schema",
      fields: [...(prev?.fields || []), { name: "new_field", type: "string", required: false }]
    }));
  };

  const handleRemoveField = (index: number) => {
    if (!generatedSchema) return;
    const newFields = [...generatedSchema.fields];
    newFields.splice(index, 1);
    setGeneratedSchema({ ...generatedSchema, fields: newFields });
  };

  const onDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragItem.current = position;
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragOverItem.current = position;
    e.preventDefault();
  };

  const onDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && generatedSchema) {
      const copyListItems = [...generatedSchema.fields];
      const dragItemContent = copyListItems[dragItem.current];
      copyListItems.splice(dragItem.current, 1);
      copyListItems.splice(dragOverItem.current, 0, dragItemContent);
      dragItem.current = null;
      dragOverItem.current = null;
      setGeneratedSchema({ ...generatedSchema, fields: copyListItems });
    }
  };

  const handleBulkIssue = async () => {
    if (isSystemPaused || !csvFile) return;

    if (!governanceRegistry.isTrustedIssuer(issuerDid)) {
      governanceRegistry.addTrustedIssuer({
        did: issuerDid,
        name: 'Polygon University',
        accreditedBy: 'tao:global-edu',
        createdAt: new Date().toISOString(),
        status: 'active'
      });
    }

    setIssueStep('signing_1');
    await mockSignTransaction(walletCtx.address || undefined);
    setIssueStep('waiting_2');
    setTimeout(async () => {
       setIssueStep('signing_2');
       await mockSignTransaction(walletCtx.address || undefined);
       setIssueStep('anchoring');
       const hash = await mockSignTransaction(walletCtx.address || undefined); 
       setTxHash(hash);

       const schemaTemplate = generatedSchema || {
         schemaName: 'Academic Certificate',
         fields: [
           { name: 'name', type: 'string', required: true },
           { name: 'degree', type: 'string', required: true },
           { name: 'achievement', type: 'string', required: false }
         ]
       };

       const schema = credentialSchemaRegistry.registerFromTemplate(schemaTemplate, issuerDid);

       const statusListId = `urn:statuslist:${issuerDid}:revocation`;
       const statusListCredential = statusListService.exportCredential(
         issuerDid,
         statusListId,
         'revocation'
       );
       
       const batch = [
          { id: "vc-" + Math.floor(Math.random() * 10000), name: "Alice Smith", did: "did:poly:0x71...9A", degree: "B.Sc. Computer Science" },
          { id: "vc-" + Math.floor(Math.random() * 10000), name: "Bob Jones", did: "did:poly:0x2B...4C", degree: "B.A. Economics" },
          { id: "vc-" + Math.floor(Math.random() * 10000), name: "Charlie Day", did: "did:poly:0x9E...1F", degree: "M.Sc. Data Science" }
       ];
       setIssuedBatch(batch);
       
       // Generate QR Codes locally with full VC payload
       const codes: Record<string, string> = {};
       for (const item of batch) {
         try {
           const statusIndex = statusListService.allocateIndex(item.id);
           const vcPayload = {
               "@context": ["https://www.w3.org/2018/credentials/v1"],
               "type": ["VerifiableCredential", "AcademicCertificate"],
             "issuer": issuerDid,
               "issuanceDate": new Date().toISOString(),
               "credentialSubject": {
                   "id": item.did,
                   "name": item.name,
                   "degree": item.degree,
                   "achievement": "High Distinction"
               },
             "credentialSchema": {
               "id": schema.id,
               "type": "JsonSchemaValidator2018"
             },
             "credentialStatus": {
               "id": `${issuerDid}/status/${statusIndex}`,
               "type": "StatusList2021Entry",
               "statusPurpose": "revocation",
               "statusListIndex": statusIndex.toString(),
               "statusListCredential": statusListId
             },
             "statusListCredential": statusListCredential,
               "proof": {
                   "type": "EcdsaSecp256k1Signature2019",
                   "created": new Date().toISOString(),
                   "verificationMethod": "did:web:polygon.university#keys-1",
                   "proofPurpose": "assertionMethod",
                   "jws": "eyJhbGciOiJFUzI1N..." 
               }
           };

           codes[item.id] = await QRCode.toDataURL(JSON.stringify(vcPayload), {
             color: {
               dark: '#000000',
               light: '#ffffff'
             },
             margin: 2,
             width: 256
           });
         } catch (err) {
           logger.error('[UniversityDashboard] QR code generation failed', err);
         }
       }
       setQrCodes(codes);

       setTimeout(() => { setIssueStep('complete'); }, 2000);
    }, 1500);
  };

  const resetIssue = () => {
    setIssueStep('idle');
    setCsvFile(null);
    setTxHash(null);
    setIssuedBatch([]);
    setQrCodes({});
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setCsvFile(e.dataTransfer.files[0]);
    }
  };

  const downloadQR = (id: string, name: string) => {
    const url = qrCodes[id];
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `credential-${name.replace(/\s+/g, '_')}-${id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const validationState = useMemo(() => {
    if (!generatedSchema) return { isValid: false, code: "NO_SCHEMA", label: "NO SCHEMA" };
    if (!generatedSchema.schemaName.trim()) return { isValid: false, code: "MISSING_NAME", label: "NAME REQ." };
    if (generatedSchema.fields.length === 0) return { isValid: false, code: "NO_FIELDS", label: "NO FIELDS" };
    if (generatedSchema.fields.some(f => f.name.trim().length === 0)) return { isValid: false, code: "EMPTY_FIELD_NAMES", label: "FIX FIELDS" };
    return { isValid: true, code: "VALID", label: "SCHEMA VALID" };
  }, [generatedSchema]);

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-4xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-data to-primary tracking-wide">
            <GlitchText text="ISSUER DASHBOARD" intensity="intense" />
          </h1>
          <div className="flex items-center gap-3 mt-1">
             <p className="text-text-muted font-mono text-sm">Polygon University</p>
             <Badge status={kybStatus === 'verified' ? 'Production Mode' : 'Sandbox Locked'} />
          </div>
        </div>
        <div className="flex gap-1 bg-black/40 p-1 rounded border border-white/10">
           {['overview', 'schema', 'issue', 'revoke'].map((tab) => (
             <button 
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-2 text-xs font-mono font-bold tracking-wider uppercase transition-all ${activeTab === tab ? 'bg-primary text-white shadow-neon' : 'text-text-muted hover:text-white'}`}
             >
                {tab}
             </button>
           ))}
        </div>
      </div>

      {isSystemPaused && (
        <div className="bg-red-900/20 border border-red-500/50 p-4 flex items-center gap-4 cyber-corner">
           <span className="material-symbols-outlined text-red-500 text-3xl">lock</span>
           <div>
              <h4 className="text-red-500 font-bold font-display tracking-wide uppercase">System Maintenance Mode</h4>
              <p className="text-red-300 text-sm font-light">Issuance and revocation capabilities have been temporarily paused by Protocol Governance.</p>
           </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in">
          <Card title="TOTAL_CREDENTIALS" className="border-l-2 border-l-primary">
             <div className="text-5xl font-bold text-white flex items-center font-mono">
                {stats ? stats.totalIssued.toLocaleString() : <Loader className="w-8 h-8 animate-spin text-text-muted" />}
             </div>
             <p className="text-green-400 text-xs font-mono mt-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm">trending_up</span> +12% this month</p>
          </Card>
          <Card title="PENDING_VERIFICATIONS" className="border-l-2 border-l-highlight">
             <div className="text-5xl font-bold text-highlight flex items-center font-mono">
                {stats ? stats.pendingVerifications : <Loader className="w-8 h-8 animate-spin text-text-muted" />}
             </div>
             <p className="text-text-muted text-xs font-mono mt-3">Requires admin signature</p>
          </Card>
          <Card title="ACTIVE_SCHEMAS" className="border-l-2 border-l-data">
             <div className="text-5xl font-bold text-data flex items-center font-mono">
                {stats ? stats.activeSchemas : <Loader className="w-8 h-8 animate-spin text-text-muted" />}
             </div>
             <p className="text-text-muted text-xs font-mono mt-3">W3C Compliant Templates</p>
          </Card>
          
          {/* Real-Time Issuance Activity Chart */}
          <Card className="md:col-span-2 h-80">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                <h3 className="text-lg font-bold text-white font-display tracking-wide">ISSUANCE_ACTIVITY</h3>
                <div className="flex items-center gap-2">
                   <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                   </span>
                   <span className="text-[10px] font-mono text-green-400 tracking-widest uppercase">LIVE FEED</span>
                </div>
            </div>
            {stats ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  stroke="#64748b" 
                  tick={{fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#94a3b8'}} 
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  tick={{fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#94a3b8'}} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                  contentStyle={{backgroundColor: '#050505', borderColor: '#334155', color: '#f8fafc', fontFamily: 'Space Grotesk', borderRadius: '4px', fontSize: '12px'}}
                  itemStyle={{padding: 0}}
                />
                <Bar name="Issued" dataKey="issued" fill="#8B5CF6" radius={[2, 2, 0, 0]} animationDuration={500} />
                <Bar name="Pending" dataKey="pending" fill="#1e293b" radius={[2, 2, 0, 0]} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-text-muted">
                    <Loader className="w-10 h-10 animate-spin" />
                </div>
            )}
          </Card>
          
          <Card className="h-80" title="NODE_HEALTH">
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-white/5 border border-white/5">
                <span className="text-xs font-mono uppercase text-text-muted">RPC Latency</span>
                <span className="text-green-400 font-mono text-sm">45ms</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 border border-white/5">
                <span className="text-xs font-mono uppercase text-text-muted">IPFS Pinning</span>
                <span className="text-green-400 font-mono text-sm">Active</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 border border-white/5">
                <span className="text-xs font-mono uppercase text-text-muted">Gas Tank</span>
                <span className="text-amber-500 font-mono text-sm">145 MATIC</span>
              </div>
              <div className="p-4 bg-black/40 border border-white/5 mt-4">
                  <div className="text-[10px] font-mono text-text-muted uppercase mb-2">Network Load</div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-data w-2/3 animate-pulse"></div>
                  </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'schema' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-right-4">
          <Card title="AI_GENERATOR">
            <div className="space-y-4">
              <div className="bg-primary/10 p-4 border border-primary/30 flex gap-3 items-start">
                 <span className="material-symbols-outlined text-primary">psychology</span>
                 <div>
                    <h4 className="font-bold text-white text-sm font-display">NEURAL SCHEMA BUILDER</h4>
                    <p className="text-xs text-text-muted mt-1">
                      Describe the credential structure. AI will generate JSON-LD.
                    </p>
                 </div>
              </div>
              <textarea 
                className="w-full h-32 p-3 bg-black/40 border border-white/10 focus:border-primary focus:ring-0 text-sm text-white font-mono placeholder-gray-600"
                placeholder="E.g. A Master's degree in Computer Science..."
                value={schemaPrompt}
                onChange={(e) => setSchemaPrompt(e.target.value)}
              />
              <div className="flex gap-3">
                  <Button onClick={handleGenerateSchema} isLoading={isGenerating} className="flex-1">
                    GENERATE
                  </Button>
                  <Button variant="outline" className="relative overflow-hidden">
                     <input type="file" accept=".json" onChange={handleImportSchema} className="absolute inset-0 opacity-0 cursor-pointer" />
                     IMPORT JSON
                  </Button>
              </div>
            </div>
          </Card>
          
          <Card title="SCHEMA_PREVIEW">
             {generatedSchema ? (
               <div className="space-y-4">
                 <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-4">
                    <div className="flex-1 mr-4 group">
                        <label className="text-[10px] text-text-muted block mb-1 group-focus-within:text-primary transition-colors flex items-center gap-1">
                            SCHEMA_ID <Edit3 className="w-3 h-3 opacity-50"/>
                        </label>
                        <input 
                            type="text" 
                            value={generatedSchema.schemaName} 
                            onChange={(e) => setGeneratedSchema({...generatedSchema, schemaName: e.target.value})}
                            className="bg-transparent border-0 border-b border-transparent focus:border-primary w-full text-white font-bold font-mono p-0 focus:ring-0 text-lg transition-all"
                            placeholder="ENTER_SCHEMA_NAME"
                        />
                    </div>
                    <div className="flex items-center gap-2 animate-in fade-in">
                        {validationState.isValid ? (
                            <div className="flex items-center gap-2 text-green-400 bg-green-400/10 px-3 py-1 rounded border border-green-400/20 shadow-[0_0_10px_rgba(34,197,94,0.2)] transition-all">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-xs font-bold tracking-wider font-mono">{validationState.label}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 px-3 py-1 rounded border border-amber-500/20 transition-all">
                                <AlertTriangle className="w-4 h-4 animate-pulse" />
                                <span className="text-xs font-bold tracking-wider font-mono">{validationState.label}</span>
                            </div>
                        )}
                    </div>
                 </div>
                 <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {generatedSchema.fields.map((field, idx) => (
                       <div key={idx} className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 hover:border-white/20 transition-colors" draggable onDragStart={(e) => onDragStart(e, idx)} onDragEnter={(e) => onDragEnter(e, idx)} onDragEnd={onDragEnd}>
                          <span className="material-symbols-outlined text-text-muted text-sm cursor-move">drag_indicator</span>
                          <input type="text" value={field.name} onChange={(e) => handleFieldChange(idx, 'name', e.target.value)} className="bg-black/20 border-0 text-xs text-white flex-1 focus:ring-0 font-mono focus:bg-white/10 transition-colors rounded-sm" placeholder="Field Name" />
                          <select value={field.type} onChange={(e) => handleFieldChange(idx, 'type', e.target.value)} className="bg-black/20 border-0 text-xs text-data focus:ring-0 font-mono cursor-pointer">
                             <option value="string">String</option>
                             <option value="number">Number</option>
                             <option value="date">Date</option>
                          </select>
                          <button onClick={() => handleRemoveField(idx)} className="text-red-500 hover:text-red-400 p-1 hover:bg-red-500/10 rounded"><span className="material-symbols-outlined text-sm">delete</span></button>
                       </div>
                    ))}
                    <button onClick={handleAddField} className="w-full py-2 border border-dashed border-white/20 text-xs text-text-muted hover:text-white hover:border-white/40 font-mono uppercase transition-all">+ Add Field</button>
                 </div>
                 <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
                    <Button variant="outline" onClick={() => setGeneratedSchema(null)}>RESET</Button>
                    <Button disabled={!validationState.isValid}>SAVE_SCHEMA</Button>
                 </div>
               </div>
             ) : (
               <div className="h-48 flex flex-col items-center justify-center text-text-muted border border-dashed border-white/10 bg-white/5">
                  <span className="material-symbols-outlined text-4xl opacity-50 mb-2">data_object</span>
                  <span className="text-xs font-mono uppercase">No Schema Loaded</span>
               </div>
             )}
          </Card>
        </div>
      )}

      {activeTab === 'issue' && (
         <Card title="BULK_ISSUANCE_PORTAL" className="max-w-3xl mx-auto min-h-[500px]">
            {kybStatus !== 'verified' ? (
                <div className="h-full flex flex-col items-center justify-center py-12 text-center relative z-10 animate-in fade-in">
                    <div className="absolute inset-0 industrial-grid opacity-20 pointer-events-none"></div>
                    <div className="bg-black/80 backdrop-blur-xl p-8 border border-red-500/30 cyber-corner max-w-md shadow-[0_0_50px_-10px_rgba(239,68,68,0.2)]">
                        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-6 animate-pulse" />
                        <h2 className="text-2xl font-bold text-white font-display uppercase tracking-widest mb-2">Production Lock</h2>
                        <div className="h-0.5 w-12 bg-red-500 mx-auto mb-6"></div>
                        <p className="text-text-muted font-mono text-xs leading-relaxed mb-8">
                            This node is currently operating in a restricted environment. To mint authentic credentials on the Polygon Mainnet, institutional KYB (Know Your Business) verification is mandatory.
                        </p>
                        <Button variant="danger" onClick={() => setIsKybModalOpen(true)} className="w-full group">
                            <Lock className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" /> 
                            INITIATE_VERIFICATION
                        </Button>
                    </div>
                </div>
            ) : (
                issueStep === 'complete' ? (
                   <div className="text-center py-8">
                      <span className="material-symbols-outlined text-6xl text-green-500 mb-4 glow-icon">check_circle</span>
                      <h3 className="text-2xl font-bold text-white font-display uppercase tracking-widest">Issuance Complete</h3>
                      <div className="font-mono text-xs text-text-muted mt-2 bg-black/40 inline-block px-3 py-1 rounded border border-white/10">
                         TX: {txHash}
                      </div>
                      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                         {issuedBatch.map((cred) => (
                            <div key={cred.id} className="bg-white/5 border border-white/10 p-4 flex flex-col items-center group relative overflow-hidden">
                               {qrCodes[cred.id] && (
                                 <div className="bg-white p-2 mb-3 rounded-sm shadow-[0_0_15px_rgba(255,255,255,0.2)] group-hover:shadow-highlight/50 transition-all">
                                   <img src={qrCodes[cred.id]} alt="QR" className="w-24 h-24" />
                                 </div>
                               )}
                               <span className="text-xs font-bold text-white mt-1">{cred.name}</span>
                               <span className="text-[10px] font-mono text-text-muted">{cred.degree}</span>
                               <span className="text-[10px] font-mono text-text-muted opacity-50">{cred.id}</span>
                               
                               {/* Action Overlay */}
                               <div className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                 <button 
                                    onClick={() => downloadQR(cred.id, cred.name)}
                                    className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-primary-hover"
                                 >
                                    <Download className="w-3 h-3" /> PNG
                                 </button>
                               </div>
                            </div>
                         ))}
                      </div>
                      <div className="flex gap-3 justify-center mt-8">
                        <Button onClick={resetIssue} variant="outline">ISSUE_NEW_BATCH</Button>
                        <Button onClick={() => issuedBatch.forEach(c => downloadQR(c.id, c.name))}>
                          <Printer className="w-4 h-4 mr-2" /> PRINT_CREDENTIALS
                        </Button>
                      </div>
                   </div>
                ) : (
                   <div className="space-y-6">
                      <div 
                         className={`border-2 border-dashed p-12 text-center transition-all ${csvFile ? 'border-green-500/50 bg-green-900/10' : 'border-white/10 hover:border-primary/50 hover:bg-white/5'}`}
                         onDragOver={(e) => !isSystemPaused && e.preventDefault()}
                         onDrop={!isSystemPaused ? handleFileDrop : undefined}
                         onClick={() => !csvFile && !isSystemPaused && document.getElementById('fileUpload')?.click()}
                      >
                         <input id="fileUpload" type="file" className="hidden" accept=".csv" onChange={(e) => e.target.files && setCsvFile(e.target.files[0])} disabled={isSystemPaused} />
                         {csvFile ? (
                            <div>
                               <span className="material-symbols-outlined text-4xl text-green-500 mb-2">csv</span>
                               <h3 className="text-white font-bold">{csvFile.name}</h3>
                            </div>
                         ) : (
                            <div>
                               <span className="material-symbols-outlined text-4xl text-text-muted mb-2">cloud_upload</span>
                               <h3 className="text-white font-bold uppercase tracking-wide">Upload CSV Source</h3>
                            </div>
                         )}
                      </div>
                      
                      <div className="flex gap-4">
                          {['Admin 1', 'Admin 2'].map((label, i) => (
                             <div key={i} className={`flex-1 p-3 border ${ (i === 0 && issueStep !== 'idle') || (i === 1 && ['signing_2', 'anchoring', 'complete'].includes(issueStep)) ? 'border-green-500/30 bg-green-500/10' : 'border-white/10 bg-white/5'} flex justify-between items-center`}>
                                <span className="text-xs font-mono uppercase text-text-muted">{label}</span>
                                {((i === 0 && issueStep !== 'idle') || (i === 1 && ['signing_2', 'anchoring', 'complete'].includes(issueStep))) && <span className="material-symbols-outlined text-sm text-green-500">check</span>}
                             </div>
                          ))}
                      </div>

                      {issueStep === 'anchoring' && (
                         <div className="w-full bg-white/5 h-1 mt-4 relative overflow-hidden">
                            <div className="absolute inset-0 bg-primary w-1/2 animate-[scan_1s_linear_infinite]"></div>
                         </div>
                      )}

                      <Button className="w-full" onClick={handleBulkIssue} disabled={!csvFile || isSystemPaused || issueStep !== 'idle'}>
                         {issueStep === 'idle' ? 'INITIATE_ISSUANCE' : 'PROCESSING_MULTISIG...'}
                      </Button>
                   </div>
                )
            )}
         </Card>
      )}

      {activeTab === 'revoke' && (
         <Card title="REVOCATION_REGISTRY">
            <div className="flex justify-between mb-6">
               <input type="text" placeholder="Search DID..." className="bg-black/40 border border-white/10 px-4 py-2 text-sm text-white focus:border-primary focus:ring-0 w-64 font-mono" />
               <Badge status={isSystemPaused ? "Suspended" : "Active"} />
            </div>
            <table className="w-full text-left text-sm">
               <thead className="text-text-muted font-mono text-xs uppercase border-b border-white/10">
                  <tr><th className="pb-3 pl-2">ID</th><th className="pb-3">Recipient</th><th className="pb-3">Date</th><th className="pb-3 text-right">Action</th></tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {[1,2,3].map(i => (
                     <tr key={i} className="hover:bg-white/5">
                        <td className="py-3 pl-2 font-mono text-white">vc-100{i}</td>
                        <td className="py-3 font-mono text-text-muted">did:poly:0x...{i}8a</td>
                        <td className="py-3 text-text-muted">2023-05-20</td>
                        <td className="py-3 text-right"><button disabled={isSystemPaused} className="text-xs text-red-500 border border-red-500/30 px-2 py-1 hover:bg-red-500/10 uppercase tracking-wider">Revoke</button></td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </Card>
      )}

      {/* KYB Modal */}
      <Modal isOpen={isKybModalOpen} onClose={() => kybStatus !== 'processing' && setIsKybModalOpen(false)} title="INSTITUTIONAL_KYB">
          {kybStatus !== 'processing' ? (
             <div className="space-y-6">
                <div className="bg-blue-500/10 border border-blue-500/30 p-4 flex gap-3">
                   <Shield className="w-5 h-5 text-blue-400 shrink-0" />
                   <p className="text-xs text-blue-300 font-mono leading-relaxed">
                      This process verifies your entity's legal status against on-chain registries. Once approved, your DID will be granted the <strong>ISSUER_ROLE</strong>.
                   </p>
                </div>
                
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-mono text-text-muted uppercase">Legal Entity Name</label>
                        <div className="relative">
                            <Building className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
                            <input type="text" value={kybData.name} onChange={e => setKybData({...kybData, name: e.target.value})} className="w-full bg-black/40 border border-white/10 pl-10 pr-4 py-2 text-sm text-white focus:border-primary font-mono" placeholder="e.g. Polygon University" />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-mono text-text-muted uppercase">Registration ID (LEI)</label>
                            <div className="relative">
                                <FileText className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
                                <input type="text" value={kybData.regId} onChange={e => setKybData({...kybData, regId: e.target.value})} className="w-full bg-black/40 border border-white/10 pl-10 pr-4 py-2 text-sm text-white focus:border-primary font-mono" placeholder="XX-9981" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-mono text-text-muted uppercase">Jurisdiction</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
                                <select value={kybData.jurisdiction} onChange={e => setKybData({...kybData, jurisdiction: e.target.value})} className="w-full bg-black/40 border border-white/10 pl-10 pr-4 py-2 text-sm text-white focus:border-primary font-mono">
                                    <option value="US">United States</option>
                                    <option value="EU">European Union</option>
                                    <option value="APAC">Asia Pacific</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                         <label className="text-xs font-mono text-text-muted uppercase">Corporate License</label>
                         <div className="border border-dashed border-white/20 bg-white/5 p-4 text-center cursor-pointer hover:bg-white/10 transition-colors relative">
                             <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => e.target.files && setKybData({...kybData, file: e.target.files[0]})} />
                             {kybData.file ? (
                                 <div className="flex items-center justify-center gap-2 text-green-400">
                                     <CheckCircle className="w-4 h-4" />
                                     <span className="text-xs font-mono">{kybData.file.name}</span>
                                 </div>
                             ) : (
                                 <div className="flex flex-col items-center gap-2 text-text-muted">
                                     <Upload className="w-6 h-6" />
                                     <span className="text-[10px] font-mono uppercase">Upload PDF / JPG</span>
                                 </div>
                             )}
                         </div>
                    </div>
                </div>

                <Button className="w-full" onClick={handleRunKyb} disabled={!kybData.name || !kybData.regId || !kybData.file}>
                   SUBMIT_FOR_VERIFICATION
                </Button>
             </div>
          ) : (
             <div className="py-8 flex flex-col items-center">
                 <div className="relative w-24 h-24 mb-8">
                     <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
                     <div className="absolute inset-0 border-t-4 border-primary rounded-full animate-spin"></div>
                     <Activity className="absolute inset-0 m-auto text-white w-8 h-8 animate-pulse" />
                 </div>
                 <div className="w-full bg-black/40 border border-white/10 p-4 font-mono text-[10px] space-y-2 h-48 overflow-y-auto">
                     {kybLogs.map((log, i) => (
                         <div key={i} className="text-green-400 animate-in slide-in-from-left-2">
                             <span className="text-white/30 mr-2">&gt;</span>{log}
                         </div>
                     ))}
                     <div className="animate-pulse text-primary">_</div>
                 </div>
             </div>
          )}
      </Modal>

    </div>
  );
};

export default UniversityDashboard;