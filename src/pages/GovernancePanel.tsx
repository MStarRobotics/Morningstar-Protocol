import React, { useEffect, useState } from 'react';
import { fetchAuditLogs, fetchInstitutions } from '../services/mockBlockchain';
import { AuditLog, Institution } from '../types';
import { Card, Badge, Button, GlitchText } from '../components/UI';
import { ShieldAlert, Activity, Lock, Users, Settings, PlayCircle } from 'lucide-react';
import { logger } from '../services/logger';

interface Props {
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
}

const GovernancePanel: React.FC<Props> = ({ isPaused, setPaused }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [activeTab, setActiveTab] = useState<'security' | 'rbac'>('security');

  useEffect(() => {
    fetchAuditLogs()
      .then(setLogs)
      .catch(err => {
        logger.error('[GovernancePanel] Failed to fetch audit logs:', err);
        setLogs([]);
      });

    fetchInstitutions()
      .then(setInstitutions)
      .catch(err => {
        logger.error('[GovernancePanel] Failed to fetch institutions:', err);
        setInstitutions([]);
      });
  }, []);

  const toggleSystemPause = () => {
    const action = isPaused ? "Resuming" : "Pausing";
    if (window.confirm(`CONFIRM: ${action} Credential Registry?`)) {
       setPaused(!isPaused);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center border-b border-white/5 pb-6">
         <div>
            <h1 className="text-3xl font-bold text-white font-display tracking-wide uppercase">
                <GlitchText text="GOVERNANCE_LAYER" intensity="intense" />
            </h1>
            <p className="text-text-muted font-mono text-xs mt-1">Protocol Admin • <span className="text-red-500">DEFAULT_ADMIN_ROLE</span></p>
         </div>
         <div className="flex gap-1 bg-black/40 p-1 border border-white/10">
            <button onClick={() => setActiveTab('security')} className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-all ${activeTab === 'security' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'text-text-muted hover:text-white'}`}>Security</button>
            <button onClick={() => setActiveTab('rbac')} className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-all ${activeTab === 'rbac' ? 'bg-data/20 text-data border border-data/50' : 'text-text-muted hover:text-white'}`}>RBAC</button>
         </div>
      </div>

      {activeTab === 'security' && (
        <div className="space-y-8 animate-in fade-in">
          {isPaused && (
             <div className="bg-red-900/30 border border-red-500 p-6 flex items-center justify-between shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                <div className="flex items-center gap-4">
                   <ShieldAlert className="w-8 h-8 text-red-500 animate-pulse" />
                   <div>
                      <h3 className="text-red-500 font-bold font-display uppercase tracking-widest text-lg">
                        <GlitchText text="PROTOCOL HALTED" intensity="heavy" />
                      </h3>
                      <p className="text-red-300 font-mono text-xs">Circuit breaker active. Transactions suspended.</p>
                   </div>
                </div>
                <Button variant="danger" onClick={toggleSystemPause}>
                   <PlayCircle className="w-4 h-4 mr-2" /> RESUME_MAINNET
                </Button>
             </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stagger-in">
             <Card className="border-t-2 border-t-red-500">
                <div className="flex items-center gap-4">
                   <ShieldAlert className={`w-8 h-8 ${isPaused ? 'text-red-500 glow-pulse' : 'text-green-500'}`} />
                   <div>
                      <h3 className="text-text-muted text-[10px] font-mono uppercase tracking-widest">Circuit Breaker</h3>
                      <p className={`text-2xl font-bold font-display ${isPaused ? 'text-red-500' : 'text-green-500'}`}>
                         {isPaused ? 'TRIPPED' : 'ARMED'}
                      </p>
                   </div>
                   {!isPaused && <div className="ml-auto"><Button variant="danger" className="h-8 text-[10px] px-2" onClick={toggleSystemPause}>TRIP</Button></div>}
                </div>
             </Card>
             <Card className="border-t-2 border-t-data">
                <div className="flex items-center gap-4">
                   <Activity className="w-8 h-8 text-data" />
                   <div>
                      <h3 className="text-text-muted text-[10px] font-mono uppercase tracking-widest">Network State</h3>
                      <p className="text-2xl font-bold font-display text-white">{isPaused ? 'PAUSED' : 'LIVE'}</p>
                   </div>
                </div>
             </Card>
             <Card className="border-t-2 border-t-amber-500">
                <div className="flex items-center gap-4">
                   <Lock className="w-8 h-8 text-amber-500" />
                   <div>
                      <h3 className="text-text-muted text-[10px] font-mono uppercase tracking-widest">Timelock</h3>
                      <p className="text-2xl font-bold font-display text-white">48H</p>
                   </div>
                </div>
             </Card>
          </div>

          <Card title="AUDIT_LOGS">
             <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                   <thead className="text-text-muted uppercase bg-white/5">
                      <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Hash</th><th className="px-4 py-3">Status</th></tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                      {logs.map((log) => (
                         <tr key={log.id} className="hover:bg-white/5">
                            <td className="px-4 py-3 text-text-muted">{log.timestamp}</td>
                            <td className="px-4 py-3 font-bold text-white">{log.action}</td>
                            <td className="px-4 py-3 text-primary">{log.actor}</td>
                            <td className="px-4 py-3 text-text-muted truncate max-w-[100px]">{log.hash}</td>
                            <td className="px-4 py-3"><Badge status={log.status} /></td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </Card>
        </div>
      )}

      {activeTab === 'rbac' && (
        <div className="space-y-6 animate-in slide-in-from-right-4">
           <Card>
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                 <h3 className="text-lg font-bold text-white font-display uppercase">Institution Registry</h3>
                 <Button className="h-8 text-xs">
                    <Settings className="w-3 h-3 mr-2" /> ADD_ENTITY
                 </Button>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left text-xs font-mono">
                    <thead className="text-text-muted uppercase bg-white/5">
                       <tr><th className="px-4 py-3">Entity Name</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">KYC</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 text-right">Admin</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                       {institutions.map((inst, i) => (
                          <tr key={i} className="hover:bg-white/5">
                             <td className="px-4 py-3 font-bold text-white">{inst.name}</td>
                             <td className="px-4 py-3 text-text-muted">{inst.address}</td>
                             <td className="px-4 py-3 text-green-400">{inst.kycStatus.toUpperCase()}</td>
                             <td className="px-4 py-3"><span className="bg-primary/20 text-primary px-1 border border-primary/30">{inst.role}</span></td>
                             <td className="px-4 py-3 text-right">
                                <button className="text-text-muted hover:text-white underline decoration-dotted">EDIT</button>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </Card>
        </div>
      )}
    </div>
  );
};

export default GovernancePanel;