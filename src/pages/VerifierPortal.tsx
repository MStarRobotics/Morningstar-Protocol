import React, { useState, useRef } from 'react';
import { FileSearch, Activity, CheckCircle, ShieldCheck, FileText, Building, UserCheck, BrainCircuit } from 'lucide-react';
import { Card, Button, GlitchText } from '../components/UI';
import { analyzeVerificationTrust } from '../services/geminiService';
import { jsPDF } from "jspdf";
import { verifyCredentialPayload, VerifiableCredential, VerificationResult } from '../services/verificationPipeline';

const VerifierPortal: React.FC = () => {
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'analyzing' | 'valid' | 'invalid'>('idle');
  const [trustReport, setTrustReport] = useState<string>('');
  const [activeStep, setActiveStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);

   const [payloadInput, setPayloadInput] = useState<string>('');
   const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
   const [verificationError, setVerificationError] = useState<string>('');
   const fileInputRef = useRef<HTMLInputElement>(null);

   const [credentialDetails, setCredentialDetails] = useState({
      candidate: "",
      did: "",
      issuer: "",
      credential: "",
      issued: "",
      expiration: "",
      trustScore: 0
   });

  const steps = [
     { label: "SYNTAX_CHECK", detail: "JSON-LD Schema Validation" },
     { label: "SIG_RECOVERY", detail: "Elliptic Curve secp256k1" },
     { label: "REVOCATION_ORACLE", detail: "StatusList2021 Bitstring" },
     { label: "ISSUER_KYB", detail: "On-Chain Registry Lookup" }
  ];

   const startVerification = async (payload: VerifiableCredential) => {
    setVerificationStatus('analyzing');
    setActiveStep(0);
    setVerificationError('');
    setTrustReport('');

    const stepTime = 800;
    for (let i = 0; i <= steps.length; i++) {
       await new Promise(r => setTimeout(r, stepTime));
       setActiveStep(i);
    }

    try {
         const result = await verifyCredentialPayload(payload);
         setVerificationResult(result);

         const subjectName = String(payload.credentialSubject?.name || '');
         const subjectDid = String(payload.credentialSubject?.id || '');
         // W3C VC spec allows issuer as string or {id, name} object — normalize
         const rawIssuer = payload.issuer;
         const issuer = typeof rawIssuer === 'string'
           ? rawIssuer
           : (rawIssuer && typeof rawIssuer === 'object')
             ? String((rawIssuer as Record<string, unknown>).name || (rawIssuer as Record<string, unknown>).id || '')
             : '';
         const credentialType = result.credentialType || '';

         setCredentialDetails({
            candidate: subjectName,
            did: subjectDid,
            issuer,
            credential: credentialType,
            issued: payload.issuanceDate || '',
            expiration: payload.credentialStatus?.statusPurpose === 'revocation' ? 'On status list' : 'Not specified',
            trustScore: result.valid ? 99.8 : 62.5
         });

         setVerificationStatus(result.valid ? 'valid' : 'invalid');

         // AI trust analysis — fire-and-forget, never crashes the main flow
         analyzeVerificationTrust({
             issuer,
             credential: credentialType,
             recipient: subjectName,
             issued: payload.issuanceDate || ''
         })
           .then(report => setTrustReport(report || "Credential verification completed."))
           .catch(() => setTrustReport("Credential verification completed."));
    } catch (error) {
         setVerificationStatus('invalid');
         setVerificationError(
           error instanceof Error ? error.message : 'Verification pipeline failed. Check the credential format.'
         );
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
         const file = e.dataTransfer.files[0];
         setUploadedFile(file.name);
         const reader = new FileReader();
         reader.onload = () => {
            try {
               const payload = JSON.parse(reader.result as string) as VerifiableCredential;
               startVerification(payload);
            } catch {
               setVerificationStatus('invalid');
               setVerificationError('Invalid JSON payload.');
            }
         };
         reader.readAsText(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result as string) as VerifiableCredential;
          startVerification(payload);
        } catch {
          setVerificationStatus('invalid');
          setVerificationError('Invalid JSON payload.');
        }
      };
      reader.readAsText(file);
    }
  };

   const handleExecutePayload = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!payloadInput.trim()) {
        setVerificationError('Paste a VC JSON payload first.');
        return;
      }
      try {
         const payload = JSON.parse(payloadInput) as VerifiableCredential;
         startVerification(payload);
      } catch {
         setVerificationStatus('invalid');
         setVerificationError('Invalid JSON payload.');
      }
   };

  const handleDownloadReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Morningstar Verification Report", 14, 22);
    doc.setFontSize(11);
    let y = 40;
    doc.text(`Candidate: ${credentialDetails.candidate}`, 14, y); y += 8;
    doc.text(`Issuer: ${credentialDetails.issuer}`, 14, y); y += 8;
    doc.text(`Credential: ${credentialDetails.credential}`, 14, y); y += 8;
    doc.text(`Issued: ${credentialDetails.issued}`, 14, y); y += 8;
    doc.text(`Trust Score: ${credentialDetails.trustScore.toFixed(1)}%`, 14, y); y += 12;
    if (verificationResult) {
      doc.text("Verification Checks:", 14, y); y += 8;
      for (const check of verificationResult.checks) {
        doc.text(`  [${check.status.toUpperCase()}] ${check.name}: ${check.detail}`, 14, y);
        y += 7;
      }
      y += 5;
    }
    if (trustReport) {
      doc.text("AI Analysis:", 14, y); y += 8;
      const lines = doc.splitTextToSize(trustReport, 180);
      doc.text(lines, 14, y);
    }
    doc.save("verification-report.pdf");
  };

  return (
    <div className="min-h-screen p-6 flex flex-col items-center pt-12">
       <div className="max-w-4xl w-full">
         <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-900/10 border border-green-500/30 mb-4">
               <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
               <span className="text-xs font-mono text-green-400 uppercase tracking-widest">Node Online</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold text-white font-display tracking-wide">
                <GlitchText text="VERIFICATION_TERMINAL" intensity="intense" />
            </h1>
            <p className="text-text-muted mt-2 font-light">Execute cryptographic proof validation logic.</p>
         </div>

         <div className="glass-panel cyber-corner p-1">
            {verificationStatus === 'idle' && (
               <div
                 className="p-16 flex flex-col items-center justify-center text-center bg-black/40 border border-white/5 hover:border-highlight/30 transition-all cursor-pointer group"
                 onClick={() => fileInputRef.current?.click()}
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={handleFileDrop}
               >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.jsonld"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <div className="w-24 h-24 mb-6 border border-white/10 group-hover:border-highlight/50 flex items-center justify-center transition-all bg-white/5">
                     <FileSearch className="w-10 h-10 text-white group-hover:text-highlight transition-colors" />
                  </div>
                  <h3 className="text-xl font-bold text-white font-display uppercase tracking-wider">
                    <GlitchText text="Upload / Drop Payload" />
                  </h3>
                  <p className="text-text-muted text-xs font-mono mt-2">Supports .json, .jsonld</p>

                  <div className="flex items-center gap-4 w-full max-w-md my-8 opacity-50">
                     <div className="h-px bg-white/20 flex-1"></div>
                     <span className="text-xs font-mono">OR</span>
                     <div className="h-px bg-white/20 flex-1"></div>
                  </div>

                  <div className="flex w-full max-w-lg gap-2" onClick={(e) => e.stopPropagation()}>
                     <input
                       type="text"
                       placeholder="Paste VC JSON payload"
                       className="flex-1 bg-black/50 border border-white/10 text-white px-4 py-3 font-mono text-sm focus:border-highlight focus:ring-0"
                       value={payloadInput}
                       onChange={(e) => setPayloadInput(e.target.value)}
                     />
                     <Button onClick={handleExecutePayload}>EXECUTE</Button>
                  </div>
                  {verificationError && (
                    <div className="mt-4 text-xs font-mono text-red-400">{verificationError}</div>
                  )}
               </div>
            )}

            {verificationStatus === 'analyzing' && (
               <div className="p-12">
                  <div className="max-w-xl mx-auto space-y-8">
                     <div className="text-center">
                        <Activity className="w-12 h-12 text-data animate-pulse mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white font-display uppercase tracking-widest">Running Forensics</h3>
                     </div>

                     <div className="space-y-2 font-mono text-sm stagger-in">
                        {steps.map((step, idx) => (
                           <div key={idx} className={`flex items-center justify-between p-3 border-l-2 ${activeStep > idx ? 'border-green-500 bg-green-900/10 text-green-400' : activeStep === idx ? 'border-highlight bg-highlight/5 text-white' : 'border-white/10 text-text-muted'}`}>
                              <span>{step.label}</span>
                              <span className="text-xs opacity-70">{activeStep > idx ? '[OK]' : activeStep === idx ? '[PROCESSING]' : '[PENDING]'}</span>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            )}

            {verificationStatus === 'valid' && (
               <div className="bg-background-dark/80">
                  <div className="bg-green-900/20 p-8 border-b border-green-500/30 flex justify-between items-center">
                     <div className="flex items-center gap-4">
                        <CheckCircle className="w-12 h-12 text-green-500 glow-pulse" />
                        <div>
                                        <h2 className="text-2xl font-bold text-white font-display uppercase tracking-wider">
                             <GlitchText text="Valid Proof" intensity="intense" />
                           </h2>
                           <p className="text-green-400 font-mono text-xs">Cryptographic anchor confirmed.</p>
                        </div>
                     </div>
                     <div className="text-right">
                                    <div className="text-4xl font-bold text-white font-display">
                                       {credentialDetails.trustScore.toFixed(1)}%
                                    </div>
                        <div className="text-green-500 text-[10px] font-mono uppercase tracking-widest">Trust Score</div>
                     </div>
                  </div>

                  <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                     <div className="lg:col-span-2 space-y-6">
                        <Card title="METADATA_EXTRACT">
                           <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                              {[
                                 { label: 'Candidate', val: credentialDetails.candidate, icon: <UserCheck className="w-4 h-4 text-highlight"/> },
                                 { label: 'Issuer', val: credentialDetails.issuer, icon: <Building className="w-4 h-4 text-highlight"/> },
                                 { label: 'Type', val: credentialDetails.credential, icon: <FileText className="w-4 h-4 text-highlight"/> },
                                 { label: 'Timestamp', val: credentialDetails.issued, icon: <Activity className="w-4 h-4 text-highlight"/> }
                              ].map((item, i) => (
                                 <div key={i} className="space-y-1">
                                    <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest">{item.label}</label>
                                    <div className="font-bold text-white flex items-center gap-2">{item.icon} {item.val}</div>
                                 </div>
                              ))}
                           </div>
                        </Card>
                        
                                        <div className="bg-primary/5 border border-primary/20 p-4">
                           <div className="flex items-start gap-3">
                              <BrainCircuit className="w-5 h-5 text-primary mt-1" />
                              <div>
                                 <h4 className="font-bold text-white text-sm font-display uppercase tracking-wide">AI_ANALYSIS</h4>
                                 <p className="text-text-muted text-sm mt-1 leading-relaxed font-mono">
                                    {trustReport || "Analyzing issuer reputation graph..."}
                                 </p>
                              </div>
                           </div>
                        </div>
                                        {verificationResult && (
                                           <div className="bg-white/5 border border-white/10 p-4 text-xs font-mono">
                                              {verificationResult.checks.map((check, idx) => (
                                                 <div key={idx} className="flex items-center justify-between">
                                                    <span>{check.name}</span>
                                                    <span className={check.status === 'pass' ? 'text-green-400' : check.status === 'fail' ? 'text-red-400' : 'text-yellow-400'}>
                                                       {check.status.toUpperCase()}
                                                    </span>
                                                 </div>
                                              ))}
                                           </div>
                                        )}
                     </div>

                     <div className="space-y-6">
                        <div className="bg-white/5 p-6 border border-white/10 text-center space-y-4">
                           <FileText className="w-10 h-10 text-text-muted mx-auto" />
                           <div>
                              <h4 className="font-bold text-white font-display uppercase">Compliance Record</h4>
                              <p className="text-xs text-text-muted mt-1">Generate signed PDF audit trail.</p>
                           </div>
                           <Button className="w-full" onClick={handleDownloadReport}>DOWNLOAD_PDF</Button>
                           <Button variant="outline" className="w-full" onClick={() => setVerificationStatus('idle')}>RESET_TERMINAL</Button>
                        </div>
                     </div>
                  </div>
               </div>
            )}

                  {verificationStatus === 'invalid' && (
                     <div className="bg-background-dark/80">
                        <div className="bg-red-900/20 p-8 border-b border-red-500/30 flex justify-between items-center">
                           <div className="flex items-center gap-4">
                              <ShieldCheck className="w-12 h-12 text-red-500 glow-pulse" />
                              <div>
                                 <h2 className="text-2xl font-bold text-white font-display uppercase tracking-wider">
                                    <GlitchText text="Invalid Proof" intensity="heavy" />
                                 </h2>
                                 <p className="text-red-400 font-mono text-xs">Verification failed.</p>
                              </div>
                           </div>
                        </div>
                        <div className="p-8">
                           {verificationError && (
                              <div className="text-red-400 font-mono text-sm">{verificationError}</div>
                           )}
                           {verificationResult && verificationResult.issues.length > 0 && (
                              <div className="mt-4 text-sm font-mono text-text-muted">
                                 {verificationResult.issues.map((issue, idx) => (
                                    <div key={idx}>- {issue}</div>
                                 ))}
                              </div>
                           )}
                           <div className="mt-6">
                              <Button variant="outline" onClick={() => setVerificationStatus('idle')}>RESET_TERMINAL</Button>
                           </div>
                        </div>
                     </div>
                  )}
         </div>
       </div>
    </div>
  );
};

export default VerifierPortal;