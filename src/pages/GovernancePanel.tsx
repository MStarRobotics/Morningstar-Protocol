import React, { useCallback, useEffect, useState } from 'react';
import { fetchAuditLogs } from '../services/mockBlockchain';
import {
  createGovernanceInstitution,
  fetchRoleAccessRequests,
  fetchGovernanceInstitutions,
  GovernanceRoleAccessRequest,
  reviewRoleAccessRequest,
  updateGovernanceInstitution,
} from '../services/governanceApi';
import { validateEntityName } from '../services/validation';
import { AuditLog, Institution } from '../types';
import { Card, Badge, Button, GlitchText, Modal } from '../components/UI';
import { ShieldAlert, Activity, Lock, Settings, PlayCircle } from 'lucide-react';
import { logger } from '../services/logger';

interface Props {
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
}

interface AddEntityFormState {
  name: string;
  address: string;
  role: Institution['role'];
  kycStatus: Institution['kycStatus'];
}

interface EditEntityFormState {
  role: Institution['role'];
  kycStatus: Institution['kycStatus'];
}

const DEFAULT_ADD_FORM: AddEntityFormState = {
  name: '',
  address: '',
  role: 'ISSUER_ROLE',
  kycStatus: 'pending',
};

const ROLE_OPTIONS: Institution['role'][] = ['ISSUER_ROLE', 'NONE'];
const KYC_OPTIONS: Institution['kycStatus'][] = ['verified', 'pending', 'rejected'];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const GovernancePanel: React.FC<Props> = ({ isPaused, setPaused }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [activeTab, setActiveTab] = useState<'security' | 'rbac' | 'access'>('security');
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(false);
  const [isLoadingRoleAccessRequests, setIsLoadingRoleAccessRequests] = useState(false);
  const [institutionsError, setInstitutionsError] = useState<string | null>(null);
  const [roleAccessError, setRoleAccessError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [roleAccessRequests, setRoleAccessRequests] = useState<GovernanceRoleAccessRequest[]>([]);
  const [addForm, setAddForm] = useState<AddEntityFormState>(DEFAULT_ADD_FORM);
  const [editForm, setEditForm] = useState<EditEntityFormState>({ role: 'NONE', kycStatus: 'pending' });
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [reviewingRoleAccessRequestId, setReviewingRoleAccessRequestId] = useState<string | null>(null);

  const loadInstitutions = useCallback(async () => {
    setIsLoadingInstitutions(true);
    setInstitutionsError(null);

    try {
      const loaded = await fetchGovernanceInstitutions();
      setInstitutions(loaded);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to fetch institutions.');
      logger.error('[GovernancePanel] Failed to fetch institutions:', err);
      setInstitutions([]);
      setInstitutionsError(message);
    } finally {
      setIsLoadingInstitutions(false);
    }
  }, []);

  const loadRoleAccessRequests = useCallback(async () => {
    setIsLoadingRoleAccessRequests(true);
    setRoleAccessError(null);

    try {
      const loaded = await fetchRoleAccessRequests();
      setRoleAccessRequests(loaded);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to fetch role access requests.');
      logger.error('[GovernancePanel] Failed to fetch role access requests:', err);
      setRoleAccessRequests([]);
      setRoleAccessError(message);
    } finally {
      setIsLoadingRoleAccessRequests(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditLogs()
      .then(setLogs)
      .catch((err) => {
        logger.error('[GovernancePanel] Failed to fetch audit logs:', err);
        setLogs([]);
      });
  }, []);

  useEffect(() => {
    void loadInstitutions();
  }, [loadInstitutions]);

  useEffect(() => {
    if (activeTab !== 'access') {
      return;
    }

    void loadRoleAccessRequests();
  }, [activeTab, loadRoleAccessRequests]);

  useEffect(() => {
    if (!feedbackMessage) {
      return undefined;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setFeedbackMessage(null);
    }, 4_000);

    return () => globalThis.clearTimeout(timeoutId);
  }, [feedbackMessage]);

  const toggleSystemPause = () => {
    const action = isPaused ? 'Resuming' : 'Pausing';
    if (window.confirm(`CONFIRM: ${action} Credential Registry?`)) {
      setPaused(!isPaused);
    }
  };

  const openAddModal = () => {
    setMutationError(null);
    setAddForm(DEFAULT_ADD_FORM);
    setIsAddModalOpen(true);
  };

  const openEditModal = (institution: Institution) => {
    setMutationError(null);
    setSelectedInstitution(institution);
    setEditForm({
      role: institution.role,
      kycStatus: institution.kycStatus,
    });
    setIsEditModalOpen(true);
  };

  const handleAddSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMutationError(null);
    setFeedbackMessage(null);

    const nameValidation = validateEntityName(addForm.name);
    if (!nameValidation.valid) {
      setMutationError(nameValidation.error || 'Entity name is invalid.');
      return;
    }

    if (!addForm.address.trim()) {
      setMutationError('Entity address is required.');
      return;
    }

    setIsSubmittingAdd(true);
    try {
      await createGovernanceInstitution({
        name: addForm.name,
        address: addForm.address,
        role: addForm.role,
        kycStatus: addForm.kycStatus,
      });
      setIsAddModalOpen(false);
      setAddForm(DEFAULT_ADD_FORM);
      setFeedbackMessage('Entity added successfully.');
      await loadInstitutions();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to add entity.');
      logger.error('[GovernancePanel] Failed to create institution:', err);
      setMutationError(message);
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedInstitution) return;

    setMutationError(null);
    setFeedbackMessage(null);
    setIsSubmittingEdit(true);

    try {
      await updateGovernanceInstitution(selectedInstitution.id, {
        role: editForm.role,
        kycStatus: editForm.kycStatus,
      });
      setIsEditModalOpen(false);
      setSelectedInstitution(null);
      setFeedbackMessage('Entity RBAC settings updated.');
      await loadInstitutions();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to update entity.');
      logger.error('[GovernancePanel] Failed to update institution:', err);
      setMutationError(message);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleReviewRoleAccessRequest = async (
    request: GovernanceRoleAccessRequest,
    approve: boolean,
  ) => {
    if (reviewingRoleAccessRequestId) return;

    setRoleAccessError(null);
    setFeedbackMessage(null);

    let reviewNote = '';
    if (!approve) {
      const note = window.prompt('Optional denial reason for audit log:', 'Access denied by governance review.');
      if (note === null) {
        return;
      }
      reviewNote = note;
    }

    setReviewingRoleAccessRequestId(request.requestId);
    try {
      await reviewRoleAccessRequest(request.requestId, approve, reviewNote);
      setFeedbackMessage(
        approve
          ? `Approved role request ${request.requestId}.`
          : `Denied role request ${request.requestId}.`,
      );
      await loadRoleAccessRequests();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to review role request.');
      logger.error('[GovernancePanel] Failed to review role access request:', err);
      setRoleAccessError(message);
    } finally {
      setReviewingRoleAccessRequestId(null);
    }
  };

  const renderKycClass = (kycStatus: Institution['kycStatus']): string => {
    if (kycStatus === 'verified') return 'text-green-400';
    if (kycStatus === 'rejected') return 'text-red-400';
    return 'text-amber-300';
  };

  const renderRoleAccessStatusClass = (status: GovernanceRoleAccessRequest['status']): string => {
    if (status === 'approved') return 'text-green-400 border-green-500/40 bg-green-900/20';
    if (status === 'denied') return 'text-red-400 border-red-500/40 bg-red-900/20';
    if (status === 'expired') return 'text-amber-300 border-amber-500/40 bg-amber-900/20';
    return 'text-data border-data/40 bg-data/10';
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center border-b border-white/5 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white font-display tracking-wide uppercase">
            <GlitchText text="GOVERNANCE_LAYER" intensity="intense" />
          </h1>
          <p className="text-text-muted font-mono text-xs mt-1">
            Protocol Admin • <span className="text-red-500">DEFAULT_ADMIN_ROLE</span>
          </p>
        </div>
        <div className="flex gap-1 bg-black/40 p-1 border border-white/10">
          <button
            onClick={() => setActiveTab('security')}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-all ${
              activeTab === 'security'
                ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                : 'text-text-muted hover:text-white'
            }`}
          >
            Security
          </button>
          <button
            onClick={() => setActiveTab('rbac')}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-all ${
              activeTab === 'rbac'
                ? 'bg-data/20 text-data border border-data/50'
                : 'text-text-muted hover:text-white'
            }`}
          >
            RBAC
          </button>
          <button
            onClick={() => setActiveTab('access')}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-all ${
              activeTab === 'access'
                ? 'bg-primary/20 text-primary border border-primary/50'
                : 'text-text-muted hover:text-white'
            }`}
          >
            Access Review
          </button>
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
                  <p className="text-red-300 font-mono text-xs">
                    Circuit breaker active. Transactions suspended.
                  </p>
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
                {!isPaused && (
                  <div className="ml-auto">
                    <Button variant="danger" className="h-8 text-[10px] px-2" onClick={toggleSystemPause}>
                      TRIP
                    </Button>
                  </div>
                )}
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
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Hash</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-text-muted">{log.timestamp}</td>
                      <td className="px-4 py-3 font-bold text-white">{log.action}</td>
                      <td className="px-4 py-3 text-primary">{log.actor}</td>
                      <td className="px-4 py-3 text-text-muted truncate max-w-[100px]">{log.hash}</td>
                      <td className="px-4 py-3">
                        <Badge status={log.status} />
                      </td>
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
            <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
              <h3 className="text-lg font-bold text-white font-display uppercase">Institution Registry</h3>
              <Button className="h-8 text-xs" onClick={openAddModal} disabled={isSubmittingAdd || isSubmittingEdit}>
                <Settings className="w-3 h-3 mr-2" /> ADD_ENTITY
              </Button>
            </div>

            {institutionsError && (
              <div className="mb-4 border border-red-500/40 bg-red-900/20 px-3 py-2 text-[11px] font-mono text-red-300">
                {institutionsError}
              </div>
            )}

            {mutationError && (
              <div className="mb-4 border border-red-500/40 bg-red-900/20 px-3 py-2 text-[11px] font-mono text-red-300">
                {mutationError}
              </div>
            )}

            {feedbackMessage && (
              <div className="mb-4 border border-green-500/40 bg-green-900/20 px-3 py-2 text-[11px] font-mono text-green-300">
                {feedbackMessage}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="text-text-muted uppercase bg-white/5">
                  <tr>
                    <th className="px-4 py-3">Entity Name</th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">KYC</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-right">Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoadingInstitutions && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-text-muted uppercase tracking-wider">
                        Loading institution registry...
                      </td>
                    </tr>
                  )}

                  {!isLoadingInstitutions && institutions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-text-muted uppercase tracking-wider">
                        No entities registered.
                      </td>
                    </tr>
                  )}

                  {!isLoadingInstitutions &&
                    institutions.map((inst) => (
                      <tr key={inst.id} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-bold text-white">{inst.name}</td>
                        <td className="px-4 py-3 text-text-muted">{inst.address}</td>
                        <td className={`px-4 py-3 ${renderKycClass(inst.kycStatus)}`}>
                          {inst.kycStatus.toUpperCase()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-1 border ${
                              inst.role === 'ISSUER_ROLE'
                                ? 'bg-primary/20 text-primary border-primary/30'
                                : 'bg-white/5 text-text-muted border-white/20'
                            }`}
                          >
                            {inst.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            className="text-text-muted hover:text-white underline decoration-dotted disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => openEditModal(inst)}
                            disabled={isSubmittingAdd || isSubmittingEdit}
                          >
                            EDIT
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'access' && (
        <div className="space-y-6 animate-in slide-in-from-right-4">
          <Card>
            <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
              <h3 className="text-lg font-bold text-white font-display uppercase">Role Access Requests</h3>
              <Button
                className="h-8 text-xs"
                onClick={() => void loadRoleAccessRequests()}
                isLoading={isLoadingRoleAccessRequests}
                disabled={Boolean(reviewingRoleAccessRequestId)}
              >
                REFRESH
              </Button>
            </div>

            {roleAccessError && (
              <div className="mb-4 border border-red-500/40 bg-red-900/20 px-3 py-2 text-[11px] font-mono text-red-300">
                {roleAccessError}
              </div>
            )}

            {feedbackMessage && (
              <div className="mb-4 border border-green-500/40 bg-green-900/20 px-3 py-2 text-[11px] font-mono text-green-300">
                {feedbackMessage}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="text-text-muted uppercase bg-white/5">
                  <tr>
                    <th className="px-4 py-3">Request</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Wallet</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoadingRoleAccessRequests && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-text-muted uppercase tracking-wider">
                        Loading role access requests...
                      </td>
                    </tr>
                  )}

                  {!isLoadingRoleAccessRequests && roleAccessRequests.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-text-muted uppercase tracking-wider">
                        No role access requests found.
                      </td>
                    </tr>
                  )}

                  {!isLoadingRoleAccessRequests &&
                    roleAccessRequests.map((request) => {
                      const isPending = request.status === 'pending';
                      const isReviewing = reviewingRoleAccessRequestId === request.requestId;
                      return (
                        <tr key={request.requestId} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-text-muted">{request.requestId}</td>
                          <td className="px-4 py-3 text-primary font-bold uppercase">{request.requestedRole}</td>
                          <td className="px-4 py-3 text-text-muted">{request.walletAddress || '--'}</td>
                          <td className="px-4 py-3 text-text-muted">{request.verifiedEmail || '--'}</td>
                          <td className="px-4 py-3 text-text-muted">{request.reason}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 text-[10px] uppercase tracking-wider border ${renderRoleAccessStatusClass(request.status)}`}
                            >
                              {request.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-text-muted">{request.createdAt}</td>
                          <td className="px-4 py-3">
                            {isPending ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  className="h-7 px-2 text-[10px]"
                                  variant="secondary"
                                  onClick={() => void handleReviewRoleAccessRequest(request, true)}
                                  isLoading={isReviewing}
                                  disabled={Boolean(reviewingRoleAccessRequestId)}
                                >
                                  APPROVE
                                </Button>
                                <Button
                                  className="h-7 px-2 text-[10px]"
                                  variant="danger"
                                  onClick={() => void handleReviewRoleAccessRequest(request, false)}
                                  disabled={Boolean(reviewingRoleAccessRequestId)}
                                >
                                  DENY
                                </Button>
                              </div>
                            ) : (
                              <div className="text-right text-[10px] text-text-muted uppercase tracking-wider">
                                Reviewed
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !isSubmittingAdd && setIsAddModalOpen(false)}
        title="ADD_INSTITUTION_ENTITY"
      >
        <form className="space-y-4" onSubmit={handleAddSubmit}>
          <div className="space-y-1">
            <label className="text-xs font-mono text-text-muted uppercase">Entity Name</label>
            <input
              type="text"
              value={addForm.name}
              onChange={(event) => setAddForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full bg-black/40 border border-white/10 px-3 py-2 text-sm text-white focus:border-primary font-mono"
              placeholder="e.g. Global University"
              maxLength={100}
              disabled={isSubmittingAdd}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-text-muted uppercase">Address</label>
            <input
              type="text"
              value={addForm.address}
              onChange={(event) => setAddForm((prev) => ({ ...prev, address: event.target.value }))}
              className="w-full bg-black/40 border border-white/10 px-3 py-2 text-sm text-white focus:border-primary font-mono"
              placeholder="e.g. 0xAbc...123"
              maxLength={200}
              disabled={isSubmittingAdd}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-mono text-text-muted uppercase">Role</label>
              <select
                value={addForm.role}
                onChange={(event) => setAddForm((prev) => ({ ...prev, role: event.target.value as Institution['role'] }))}
                className="w-full bg-black/40 border border-white/10 px-3 py-2 text-sm text-white focus:border-primary font-mono"
                disabled={isSubmittingAdd}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-text-muted uppercase">KYC Status</label>
              <select
                value={addForm.kycStatus}
                onChange={(event) => setAddForm((prev) => ({ ...prev, kycStatus: event.target.value as Institution['kycStatus'] }))}
                className="w-full bg-black/40 border border-white/10 px-3 py-2 text-sm text-white focus:border-primary font-mono"
                disabled={isSubmittingAdd}
              >
                {KYC_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs px-4"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isSubmittingAdd}
            >
              CANCEL
            </Button>
            <Button type="submit" className="h-9 text-xs px-4" isLoading={isSubmittingAdd} disabled={isSubmittingAdd}>
              ADD_ENTITY
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !isSubmittingEdit && setIsEditModalOpen(false)}
        title="EDIT_ENTITY_RBAC"
      >
        <form className="space-y-4" onSubmit={handleEditSubmit}>
          <div className="bg-white/5 border border-white/10 px-3 py-2">
            <p className="text-[10px] text-text-muted uppercase font-mono">Entity</p>
            <p className="text-sm text-white font-mono">{selectedInstitution?.name || '--'}</p>
          </div>

          <div className="bg-white/5 border border-white/10 px-3 py-2">
            <p className="text-[10px] text-text-muted uppercase font-mono">Address</p>
            <p className="text-sm text-white font-mono">{selectedInstitution?.address || '--'}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-mono text-text-muted uppercase">Role</label>
              <select
                value={editForm.role}
                onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value as Institution['role'] }))}
                className="w-full bg-black/40 border border-white/10 px-3 py-2 text-sm text-white focus:border-primary font-mono"
                disabled={isSubmittingEdit}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-text-muted uppercase">KYC Status</label>
              <select
                value={editForm.kycStatus}
                onChange={(event) => setEditForm((prev) => ({ ...prev, kycStatus: event.target.value as Institution['kycStatus'] }))}
                className="w-full bg-black/40 border border-white/10 px-3 py-2 text-sm text-white focus:border-primary font-mono"
                disabled={isSubmittingEdit}
              >
                {KYC_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs px-4"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSubmittingEdit}
            >
              CANCEL
            </Button>
            <Button type="submit" className="h-9 text-xs px-4" isLoading={isSubmittingEdit} disabled={isSubmittingEdit}>
              SAVE_CHANGES
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default GovernancePanel;
