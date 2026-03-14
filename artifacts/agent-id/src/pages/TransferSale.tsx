import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRightLeft, AlertCircle, RefreshCw, X, Check, CheckCircle, ShieldCheck, Package, Link2, Ban, ChevronRight, ChevronLeft, DollarSign, FileText, AlertTriangle, Loader2, Flag, BadgeCheck } from 'lucide-react';
import { GlassCard, PrimaryButton, Identicon, AgentHandle, TrustScoreRing, StatusDot, ListSkeleton, EmptyState } from '@/components/shared';
import { api, type Agent, type TransferSale as TransferSaleType, type TransferType, type TransferStatus, type TransferReadinessReport, type TransferHandoff, type TransferHandoffItem, type TransferPublicListing, type TransferOwnershipFields } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

const TRANSFER_TYPE_INFO: Record<TransferType, { label: string; description: string; icon: typeof Package }> = {
  identity_only: {
    label: 'Identity Only',
    description: 'Transfer the handle, identity document, and trust history. No operational assets (endpoints, API keys, integrations) are included. Buyer starts fresh operationally.',
    icon: FileText,
  },
  operating_agent: {
    label: 'Operating Agent',
    description: 'Transfer the identity plus all operational configuration — endpoints, API keys, integrations, and capabilities. Buyer inherits the running agent as-is.',
    icon: Link2,
  },
  full_agent_business: {
    label: 'Full Agent Business',
    description: 'Transfer everything: identity, operations, marketplace listings, client relationships, revenue history, and all associated data. Complete change of control.',
    icon: Package,
  },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(148,163,184,0.1)', color: 'var(--text-dim)' },
  listed: { bg: 'rgba(59,130,246,0.1)', color: 'var(--accent)' },
  pending_acceptance: { bg: 'rgba(245,158,11,0.1)', color: 'var(--warning, #f59e0b)' },
  in_handoff: { bg: 'rgba(168,85,247,0.1)', color: '#a855f7' },
  completed: { bg: 'rgba(16,185,129,0.1)', color: 'var(--success)' },
  cancelled: { bg: 'rgba(239,68,68,0.1)', color: 'var(--danger)' },
  disputed: { bg: 'rgba(239,68,68,0.1)', color: 'var(--danger)' },
};

function TransferStatusBadge({ status }: { status: TransferStatus | string }) {
  const style = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: style.bg, color: style.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.color }} />
      {status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

export function TransferWizardModal({ agent, existingTransfer, onClose, onComplete }: { agent: Agent; existingTransfer?: TransferSaleType; onClose: () => void; onComplete: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [transferType, setTransferType] = useState<TransferType>(existingTransfer?.transferType || 'identity_only');
  const [readiness, setReadiness] = useState<TransferReadinessReport | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [askingPrice, setAskingPrice] = useState(existingTransfer?.askingPrice || '');
  const [currency, setCurrency] = useState(existingTransfer?.currency || 'USD');
  const [notes, setNotes] = useState(existingTransfer?.notes || '');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [createdTransfer, setCreatedTransfer] = useState<TransferSaleType | null>(null);
  const [draftId] = useState<string | undefined>(existingTransfer?.id);

  const isEligible = agent.verificationStatus === 'verified' && agent.status === 'active';

  const fetchReadiness = useCallback(async () => {
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const report = await api.transferSale.readiness(agent.id);
      setReadiness(report);
    } catch (e: unknown) {
      setReadinessError(e instanceof Error ? e.message : 'Failed to load readiness report');
    } finally {
      setReadinessLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    if (step === 2) fetchReadiness();
  }, [step, fetchReadiness]);

  const handlePublish = async () => {
    if (!askingPrice.trim()) return;
    setPublishing(true);
    setPublishError(null);
    try {
      let transfer: TransferSaleType;
      if (draftId) {
        transfer = await api.transferSale.update(draftId, {
          transferType,
          askingPrice: askingPrice.trim(),
          currency,
          notes: notes.trim() || undefined,
        });
        await api.transferSale.publish(draftId);
      } else {
        transfer = await api.transferSale.create({
          agentId: agent.id,
          transferType,
          askingPrice: askingPrice.trim(),
          currency,
          notes: notes.trim() || undefined,
        });
        await api.transferSale.publish(transfer.id);
      }
      setCreatedTransfer(transfer);
    } catch (e: unknown) {
      setPublishError(e instanceof Error ? e.message : 'Failed to publish listing');
    } finally {
      setPublishing(false);
    }
  };

  if (!isEligible) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
        <div className="w-full max-w-lg rounded-2xl p-6 relative" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
          <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-dim)' }} aria-label="Close"><X className="w-5 h-5" /></button>
          <div className="text-center py-8">
            <Ban className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--danger)' }} />
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Agent Not Eligible</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              This agent must be both <strong>verified</strong> and <strong>active</strong> before it can be listed for transfer.
            </p>
            <div className="space-y-2 text-sm text-left max-w-xs mx-auto">
              <div className="flex items-center gap-2">
                {agent.verificationStatus === 'verified' ? <CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} /> : <AlertCircle className="w-4 h-4" style={{ color: 'var(--danger)' }} />}
                <span style={{ color: agent.verificationStatus === 'verified' ? 'var(--success)' : 'var(--text-muted)' }}>Verification: {agent.verificationStatus || 'unverified'}</span>
              </div>
              <div className="flex items-center gap-2">
                {agent.status === 'active' ? <CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} /> : <AlertCircle className="w-4 h-4" style={{ color: 'var(--danger)' }} />}
                <span style={{ color: agent.status === 'active' ? 'var(--success)' : 'var(--text-muted)' }}>Status: {agent.status}</span>
              </div>
            </div>
          </div>
          <PrimaryButton variant="ghost" className="w-full" onClick={onClose}>Close</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-2xl rounded-2xl p-6 relative max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-dim)' }} aria-label="Close"><X className="w-5 h-5" /></button>

        <div className="flex items-center gap-3 mb-6">
          <ArrowRightLeft className="w-6 h-6" style={{ color: 'var(--accent)' }} />
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Transfer / Sell @{agent.handle}</h3>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{
                background: step >= s ? 'var(--accent)' : 'var(--bg-base)',
                color: step >= s ? '#fff' : 'var(--text-dim)',
                border: step >= s ? 'none' : '1px solid var(--border-color)',
              }}>{step > s ? <Check className="w-4 h-4" /> : s}</div>
              {s < 4 && <div className="w-8 h-0.5" style={{ background: step > s ? 'var(--accent)' : 'var(--border-color)' }} />}
            </div>
          ))}
          <span className="ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            {step === 1 && 'Transfer Type'}
            {step === 2 && 'Readiness Report'}
            {step === 3 && 'Set Terms'}
            {step === 4 && 'Confirmation'}
          </span>
        </div>

        {step === 1 && (
          <div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Choose what you're transferring. Each level includes everything from the previous level.</p>
            <div className="space-y-3">
              {(Object.entries(TRANSFER_TYPE_INFO) as [TransferType, typeof TRANSFER_TYPE_INFO[TransferType]][]).map(([type, info]) => {
                const Icon = info.icon;
                const selected = transferType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setTransferType(type)}
                    className="w-full text-left p-4 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: selected ? 'rgba(59,130,246,0.08)' : 'var(--bg-base)',
                      border: selected ? '2px solid var(--accent)' : '2px solid var(--border-color)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: selected ? 'var(--accent)' : 'var(--text-dim)' }} />
                      <div>
                        <div className="font-semibold text-sm mb-1" style={{ color: selected ? 'var(--accent)' : 'var(--text-primary)' }}>{info.label}</div>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{info.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end mt-6">
              <PrimaryButton onClick={() => setStep(2)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Review what's included in this transfer. The readiness report is generated from your agent's current configuration.</p>
            {readinessLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" style={{ color: 'var(--accent)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Generating readiness report...</p>
              </div>
            ) : readinessError ? (
              <div className="py-8 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
                <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{readinessError}</p>
                <PrimaryButton variant="ghost" onClick={fetchReadiness}><RefreshCw className="w-4 h-4 mr-1" /> Retry</PrimaryButton>
              </div>
            ) : readiness ? (
              <div>
                {readiness.blockers.length > 0 && (
                  <div className="p-3 rounded-lg mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
                      <span className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Blockers Found</span>
                    </div>
                    <ul className="text-xs space-y-1 pl-6" style={{ color: 'var(--danger)' }}>
                      {readiness.blockers.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg p-4" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--success)' }}>Transferable</span>
                    </div>
                    {readiness.transferable.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No items</p>
                    ) : (
                      <div className="space-y-2">
                        {readiness.transferable.map(item => (
                          <div key={item.id} className="text-xs">
                            <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                            <div style={{ color: 'var(--text-dim)' }}>{item.description}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg p-4" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Link2 className="w-4 h-4" style={{ color: 'var(--warning, #f59e0b)' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--warning, #f59e0b)' }}>Must Reconnect</span>
                    </div>
                    {readiness.mustReconnect.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No items</p>
                    ) : (
                      <div className="space-y-2">
                        {readiness.mustReconnect.map(item => (
                          <div key={item.id} className="text-xs">
                            <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                            <div style={{ color: 'var(--text-dim)' }}>{item.description}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg p-4" style={{ background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.2)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Ban className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Excluded</span>
                    </div>
                    {readiness.excluded.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No items</p>
                    ) : (
                      <div className="space-y-2">
                        {readiness.excluded.map(item => (
                          <div key={item.id} className="text-xs">
                            <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                            <div style={{ color: 'var(--text-dim)' }}>{item.description}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex justify-between mt-6">
              <PrimaryButton variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </PrimaryButton>
              <PrimaryButton onClick={() => setStep(3)} disabled={!readiness || readiness.blockers.length > 0 || readinessLoading || !!readinessError}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Set the asking price and any terms for this transfer listing.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Asking Price *</label>
                  <input
                    type="number"
                    value={askingPrice}
                    onChange={e => setAskingPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Currency</label>
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any additional terms, conditions, or information for potential buyers..."
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <PrimaryButton variant="ghost" onClick={() => setStep(2)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </PrimaryButton>
              <PrimaryButton onClick={() => setStep(4)} disabled={!askingPrice.trim()}>
                Review <ChevronRight className="w-4 h-4 ml-1" />
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 4 && !createdTransfer && (
          <div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Review all details before publishing. Once published, this listing will be visible to potential buyers.</p>
            {publishError && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {publishError}
              </div>
            )}
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-color)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-dim)' }}>Transfer Summary</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Agent</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>@{agent.handle}</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Transfer Type</span>
                  <span style={{ color: 'var(--text-primary)' }}>{TRANSFER_TYPE_INFO[transferType].label}</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Asking Price</span>
                  <span className="font-bold" style={{ color: 'var(--accent)' }}>${askingPrice} {currency}</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Trust Score</span>
                  <span style={{ color: 'var(--text-primary)' }}>{agent.trustScore}</span>
                </div>
                {notes && (
                  <div className="py-1">
                    <span className="block mb-1" style={{ color: 'var(--text-muted)' }}>Notes</span>
                    <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{notes}</span>
                  </div>
                )}
              </div>
              {readiness && (
                <div className="pt-3 border-t" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <div className="font-bold" style={{ color: 'var(--success)' }}>{readiness.transferable.length}</div>
                      <div style={{ color: 'var(--text-dim)' }}>Transferable</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold" style={{ color: 'var(--warning, #f59e0b)' }}>{readiness.mustReconnect.length}</div>
                      <div style={{ color: 'var(--text-dim)' }}>Must Reconnect</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold" style={{ color: 'var(--text-dim)' }}>{readiness.excluded.length}</div>
                      <div style={{ color: 'var(--text-dim)' }}>Excluded</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between mt-6">
              <PrimaryButton variant="ghost" onClick={() => setStep(3)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </PrimaryButton>
              <PrimaryButton onClick={handlePublish} disabled={publishing}>
                {publishing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Publishing...</> : <>Confirm &amp; Publish <DollarSign className="w-4 h-4 ml-1" /></>}
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 4 && createdTransfer && (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--success)' }} />
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Transfer Listed</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              Your agent @{agent.handle} is now listed for transfer at ${askingPrice} {currency}.
            </p>
            <div className="text-xs mb-6" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Transfer ID: {createdTransfer.id}
            </div>
            <PrimaryButton onClick={() => { onComplete(); onClose(); }}>Done</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

export function HandoffChecklist({ transferId }: { transferId: string }) {
  const { userId } = useAuth();
  const [transfer, setTransfer] = useState<TransferSaleType | null>(null);
  const [handoff, setHandoff] = useState<TransferHandoff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, h] = await Promise.all([
        api.transferSale.get(transferId),
        api.transferSale.handoff.get(transferId),
      ]);
      setTransfer(t);
      setHandoff(h);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load handoff data');
    } finally {
      setLoading(false);
    }
  }, [transferId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (transfer?.status !== 'in_handoff') return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [transfer?.status, fetchData]);

  const isSeller = transfer?.sellerUserId === userId;
  const isBuyer = transfer?.buyerUserId === userId;

  const handleAcknowledgeItem = async (itemId: string) => {
    setActionLoading(itemId);
    try {
      await api.transferSale.handoff.acknowledgeItem(transferId, itemId);
      await fetchData();
    } catch { /* handled by re-fetch */ }
    finally { setActionLoading(null); }
  };

  const handleAcknowledge = async (role: 'seller' | 'buyer') => {
    setActionLoading(`ack_${role}`);
    try {
      if (role === 'seller') await api.transferSale.handoff.acknowledgeSeller(transferId);
      else await api.transferSale.handoff.acknowledgeBuyer(transferId);
      await fetchData();
    } catch { /* handled by re-fetch */ }
    finally { setActionLoading(null); }
  };

  const handleComplete = async () => {
    setActionLoading('complete');
    try {
      await api.transferSale.handoff.complete(transferId);
      await fetchData();
    } catch { /* handled by re-fetch */ }
    finally { setActionLoading(null); }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim()) return;
    setDisputeSubmitting(true);
    try {
      await api.transferSale.handoff.dispute(transferId, disputeReason.trim());
      setShowDispute(false);
      await fetchData();
    } catch { /* handled by re-fetch */ }
    finally { setDisputeSubmitting(false); }
  };

  if (loading) return <ListSkeleton rows={6} />;
  if (error) return (
    <div className="text-center py-12">
      <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
      <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>{error}</p>
      <PrimaryButton variant="ghost" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
    </div>
  );
  if (!transfer || !handoff) return null;

  const systemItems = handoff.items.filter(i => i.category === 'system_validated');
  const manualItems = handoff.items.filter(i => i.category === 'manual_acknowledgment');
  const canComplete = handoff.allSystemValidated && handoff.sellerAcknowledged && handoff.buyerAcknowledged;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Handoff Checklist</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            @{transfer.agentHandle} — {TRANSFER_TYPE_INFO[transfer.transferType]?.label || transfer.transferType}
          </p>
        </div>
        <TransferStatusBadge status={transfer.status} />
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>Progress</span>
          <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>{Math.round(handoff.progress * 100)}%</span>
        </div>
        <div className="h-2 rounded-full" style={{ background: 'var(--bg-base)' }}>
          <div className="h-2 rounded-full transition-all" style={{ width: `${handoff.progress * 100}%`, background: 'var(--accent)' }} />
        </div>
      </div>

      <div className="space-y-6">
        <GlassCard>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5" style={{ color: 'var(--domain)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>System-Validated Items</h3>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-dim)' }}>These items are automatically verified by the platform when conditions are met.</p>
          <div className="space-y-2">
            {systemItems.map(item => (
              <HandoffItemRow key={item.id} item={item} isSystem loading={actionLoading === item.id} />
            ))}
            {systemItems.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No system-validated items for this transfer type.</p>}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-4">
            <Check className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Manual Acknowledgments</h3>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-dim)' }}>These items require explicit confirmation from the buyer or seller.</p>
          <div className="space-y-2">
            {manualItems.map(item => (
              <HandoffItemRow
                key={item.id}
                item={item}
                isSystem={false}
                loading={actionLoading === item.id}
                onAcknowledge={() => handleAcknowledgeItem(item.id)}
                canAcknowledge={isSeller || isBuyer}
              />
            ))}
            {manualItems.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No manual acknowledgments for this transfer type.</p>}
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassCard>
            <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Seller Acknowledgment</h4>
            {handoff.sellerAcknowledged ? (
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-5 h-5" style={{ color: 'var(--success)' }} />
                <span className="text-sm" style={{ color: 'var(--success)' }}>Seller has acknowledged</span>
              </div>
            ) : isSeller ? (
              <PrimaryButton onClick={() => handleAcknowledge('seller')} disabled={actionLoading === 'ack_seller'}>
                {actionLoading === 'ack_seller' ? 'Acknowledging...' : 'Acknowledge as Seller'}
              </PrimaryButton>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Waiting for seller acknowledgment...</p>
            )}
          </GlassCard>

          <GlassCard>
            <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Buyer Acknowledgment</h4>
            {handoff.buyerAcknowledged ? (
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-5 h-5" style={{ color: 'var(--success)' }} />
                <span className="text-sm" style={{ color: 'var(--success)' }}>Buyer has acknowledged</span>
              </div>
            ) : isBuyer ? (
              <PrimaryButton onClick={() => handleAcknowledge('buyer')} disabled={actionLoading === 'ack_buyer'}>
                {actionLoading === 'ack_buyer' ? 'Acknowledging...' : 'Acknowledge as Buyer'}
              </PrimaryButton>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Waiting for buyer acknowledgment...</p>
            )}
          </GlassCard>
        </div>

        <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          {transfer.status === 'in_handoff' && (isSeller || isBuyer) && (
            <PrimaryButton variant="ghost" onClick={() => setShowDispute(true)}>
              <Flag className="w-4 h-4 mr-1" /> Raise Dispute
            </PrimaryButton>
          )}
          {!canComplete && transfer.status === 'in_handoff' && (
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>All items must be validated and both parties must acknowledge before handoff can be completed.</div>
          )}
          {canComplete && transfer.status === 'in_handoff' && (
            <PrimaryButton onClick={handleComplete} disabled={actionLoading === 'complete'}>
              {actionLoading === 'complete' ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Completing...</> : 'Complete Handoff'}
            </PrimaryButton>
          )}
        </div>

        {transfer.status === 'completed' && (
          <div className="text-center py-6 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <CheckCircle className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--success)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Transfer Complete</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Completed on {transfer.completedAt ? new Date(transfer.completedAt).toLocaleDateString() : 'N/A'}
            </p>
          </div>
        )}

        {transfer.status === 'disputed' && (
          <div className="text-center py-6 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--danger)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Transfer Disputed</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>This transfer is under review. Contact support for assistance.</p>
          </div>
        )}
      </div>

      {showDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 relative" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
            <button onClick={() => setShowDispute(false)} className="absolute top-4 right-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--text-dim)' }} aria-label="Close"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-3 mb-4">
              <Flag className="w-5 h-5" style={{ color: 'var(--danger)' }} />
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Raise Dispute</h3>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Describe the issue with this transfer. Both parties and support will be notified.</p>
            <textarea
              value={disputeReason}
              onChange={e => setDisputeReason(e.target.value)}
              placeholder="Explain the reason for the dispute..."
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none mb-4"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-3">
              <PrimaryButton variant="danger" onClick={handleDispute} disabled={disputeSubmitting || !disputeReason.trim()}>
                {disputeSubmitting ? 'Submitting...' : 'Submit Dispute'}
              </PrimaryButton>
              <PrimaryButton variant="ghost" onClick={() => setShowDispute(false)}>Cancel</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HandoffItemRow({ item, isSystem, loading, onAcknowledge, canAcknowledge }: {
  item: TransferHandoffItem;
  isSystem: boolean;
  loading?: boolean;
  onAcknowledge?: () => void;
  canAcknowledge?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-base)' }}>
      <div className="flex-shrink-0">
        {item.completed ? (
          isSystem ? (
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.15)' }}>
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--domain)' }} />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)' }}>
              <Check className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
            </div>
          )
        ) : (
          <div className="w-6 h-6 rounded-full border-2" style={{ borderColor: 'var(--border-color)' }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)' }}>{item.label}</div>
        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{item.description}</div>
        {item.completed && item.completedAt && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            {isSystem ? 'System verified' : 'Acknowledged'} {new Date(item.completedAt).toLocaleString()}
          </div>
        )}
      </div>
      {!item.completed && !isSystem && onAcknowledge && canAcknowledge && (
        <PrimaryButton variant="ghost" onClick={onAcknowledge} disabled={loading} className="!text-xs !py-1 !px-2">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
        </PrimaryButton>
      )}
      {item.completed && isSystem && (
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--domain)' }}>Verified</span>
      )}
    </div>
  );
}

export function BuyerAcquisitionView() {
  const { transferId } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [listing, setListing] = useState<TransferPublicListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const fetchListing = useCallback(async () => {
    if (!transferId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.transferSale.publicListing(transferId);
      setListing(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load transfer listing');
    } finally {
      setLoading(false);
    }
  }, [transferId]);

  useEffect(() => { fetchListing(); }, [fetchListing]);

  const handlePurchase = async () => {
    if (!transferId) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      await api.transferSale.purchase(transferId);
      navigate(`/dashboard/transfers/${transferId}`);
    } catch (e: unknown) {
      setPurchaseError(e instanceof Error ? e.message : 'Failed to initiate purchase');
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[900px] mx-auto px-6 py-10"><ListSkeleton rows={8} /></div>
    </div>
  );

  if (error || !listing) return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[900px] mx-auto px-6 py-10 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Listing not found</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error || 'This transfer listing does not exist or is no longer available.'}</p>
        <PrimaryButton variant="ghost" onClick={fetchListing}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
      </div>
    </div>
  );

  const { transfer, agent, transferable, mustReconnect } = listing;
  const typeInfo = TRANSFER_TYPE_INFO[transfer.transferType] || TRANSFER_TYPE_INFO.identity_only;

  return (
    <div className="pt-16" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[900px] mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <TransferStatusBadge status={transfer.status} />
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}>{typeInfo.label}</span>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Agent Transfer: @{agent.handle}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{agent.displayName} — {agent.description || 'No description provided'}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <GlassCard>
              <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Agent Identity</h3>
              <div className="flex items-center gap-4 mb-4">
                <Identicon handle={agent.handle} size={48} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.displayName}</span>
                    <StatusDot status={agent.status as 'active' | 'inactive' | 'draft'} />
                  </div>
                  <AgentHandle handle={agent.handle} size="sm" />
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Included Assets</h3>
              {transferable.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Asset details will be available after readiness check.</p>
              ) : (
                <div className="space-y-2">
                  {transferable.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.05)' }}>
                      <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} />
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{item.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {mustReconnect.length > 0 && (
              <GlassCard>
                <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Buyer Must Reconnect</h3>
                <div className="space-y-2">
                  {mustReconnect.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.05)' }}>
                      <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--warning, #f59e0b)' }} />
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{item.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>

          <div className="space-y-6">
            <GlassCard>
              <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Asking Price</h3>
              <div className="text-3xl font-bold mb-1" style={{ color: 'var(--accent)' }}>${transfer.askingPrice}</div>
              <div className="text-xs mb-4" style={{ color: 'var(--text-dim)' }}>{transfer.currency}</div>
              {transfer.notes && (
                <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--bg-base)' }}>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-dim)' }}>Seller Notes</div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{transfer.notes}</p>
                </div>
              )}
              {purchaseError && (
                <div className="flex items-center gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {purchaseError}
                </div>
              )}
              {transfer.status === 'listed' && userId && (
                <PrimaryButton className="w-full" onClick={handlePurchase} disabled={purchasing}>
                  {purchasing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Processing...</> : 'Initiate Purchase'}
                </PrimaryButton>
              )}
              {transfer.status === 'listed' && !userId && (
                <PrimaryButton className="w-full" onClick={() => navigate('/sign-in')} variant="ghost">Sign in to Purchase</PrimaryButton>
              )}
              {transfer.status !== 'listed' && (
                <p className="text-sm text-center" style={{ color: 'var(--text-dim)' }}>This listing is no longer available for purchase.</p>
              )}
            </GlassCard>

            <GlassCard>
              <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Trust Profile</h3>
              <div className="flex justify-center mb-4">
                <TrustScoreRing score={transfer.agentTrustScore} size={80} />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Current Score</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{transfer.agentTrustScore}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Historical Peak</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{transfer.historicalTrustPeak}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(30,41,59,0.5)' }}>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Trust scores may change after transfer due to operator re-verification requirements.
                </p>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TransferDashboardPage() {
  const routerLocation = useLocation();
  const pathname = routerLocation.pathname;
  const transferMatch = pathname.match(/\/dashboard\/transfers\/([^/]+)/);
  const transferId = transferMatch ? transferMatch[1] : null;
  const isHandoff = pathname.endsWith('/handoff');

  if (isHandoff && transferId) {
    return <HandoffChecklist transferId={transferId} />;
  }

  if (transferId) {
    return <TransferDetailView transferId={transferId} />;
  }

  return <TransferListView />;
}

function TransferListView() {
  const navigate = useNavigate();
  const [transfers, setTransfers] = useState<TransferSaleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.transferSale.list();
      setTransfers(res.transfers || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  if (loading) return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Agent Transfers</h1>
      <ListSkeleton rows={4} />
    </div>
  );

  if (error) return (
    <div className="text-center py-12">
      <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
      <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>{error}</p>
      <PrimaryButton variant="ghost" onClick={fetchTransfers}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Agent Transfers</h1>
      {transfers.length === 0 ? (
        <EmptyState
          icon={<ArrowRightLeft className="w-8 h-8" style={{ color: 'var(--text-dim)' }} />}
          title="No transfers"
          description="You have no active or past agent transfers. Use the 'Transfer / Sell' button on an agent card to start."
        />
      ) : (
        <div className="space-y-3">
          {transfers.map(t => (
            <GlassCard key={t.id} hover className="cursor-pointer !p-4" onClick={() => {
              if (t.status === 'in_handoff') navigate(`/dashboard/transfers/${t.id}/handoff`);
              else navigate(`/dashboard/transfers/${t.id}`);
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Identicon handle={t.agentHandle} size={36} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>@{t.agentHandle}</span>
                      <TransferStatusBadge status={t.status} />
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                      {TRANSFER_TYPE_INFO[t.transferType]?.label || t.transferType} — ${t.askingPrice} {t.currency}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-dim)' }} />
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function TransferDetailView({ transferId }: { transferId: string }) {
  const navigate = useNavigate();
  const [transfer, setTransfer] = useState<TransferSaleType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchTransfer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await api.transferSale.get(transferId);
      setTransfer(t);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load transfer');
    } finally {
      setLoading(false);
    }
  }, [transferId]);

  useEffect(() => { fetchTransfer(); }, [fetchTransfer]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.transferSale.cancel(transferId);
      await fetchTransfer();
    } catch { /* handled by re-fetch */ }
    finally { setCancelling(false); }
  };

  if (loading) return <ListSkeleton rows={6} />;
  if (error || !transfer) return (
    <div className="text-center py-12">
      <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger)' }} />
      <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>{error || 'Transfer not found'}</p>
      <PrimaryButton variant="ghost" onClick={fetchTransfer}><RefreshCw className="w-4 h-4 mr-2" /> Retry</PrimaryButton>
    </div>
  );

  return (
    <div>
      <button onClick={() => navigate('/dashboard/transfers')} className="flex items-center gap-1 text-sm mb-4 cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--accent)' }}>
        <ChevronLeft className="w-4 h-4" /> All Transfers
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Transfer: @{transfer.agentHandle}</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{TRANSFER_TYPE_INFO[transfer.transferType]?.label || transfer.transferType}</p>
        </div>
        <TransferStatusBadge status={transfer.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <GlassCard className="!p-4">
          <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Asking Price</div>
          <div className="text-xl font-bold" style={{ color: 'var(--accent)' }}>${transfer.askingPrice} {transfer.currency}</div>
        </GlassCard>
        <GlassCard className="!p-4">
          <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Trust Score</div>
          <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{transfer.agentTrustScore}</div>
        </GlassCard>
        <GlassCard className="!p-4">
          <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Created</div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{new Date(transfer.createdAt).toLocaleDateString()}</div>
        </GlassCard>
      </div>

      {transfer.notes && (
        <GlassCard className="mb-6">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Notes</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{transfer.notes}</p>
        </GlassCard>
      )}

      <div className="flex gap-3">
        {transfer.status === 'draft' && (
          <PrimaryButton onClick={() => navigate('/dashboard')}>
            Continue Setup <ChevronRight className="w-4 h-4 ml-1" />
          </PrimaryButton>
        )}
        {transfer.status === 'in_handoff' && (
          <PrimaryButton onClick={() => navigate(`/dashboard/transfers/${transfer.id}/handoff`)}>
            Open Handoff Checklist <ChevronRight className="w-4 h-4 ml-1" />
          </PrimaryButton>
        )}
        {(transfer.status === 'listed' || transfer.status === 'draft') && (
          <PrimaryButton variant="danger" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling...' : 'Cancel Listing'}
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}

export function TransferDisclosure({ agent }: { agent: Agent & TransferOwnershipFields }) {
  if (!agent.underNewOwnership) return null;

  return (
    <GlassCard className="!border-amber-500/30">
      <div className="flex items-start gap-3 mb-4">
        <div className="px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Under New Ownership
        </div>
      </div>

      <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>About This Transfer</h3>
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        This agent has been transferred to a new operator. Historical metrics reflect the agent's previous performance under prior ownership. Current metrics reflect the new operator's standing.
      </p>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-lg p-3" style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.15)' }}>
          <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-dim)' }}>Historical (Previous Owner)</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Trust Peak</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{agent.historicalTrustPeak ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Transferred</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{agent.transferredAt ? new Date(agent.transferredAt).toLocaleDateString() : '—'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
          <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-dim)' }}>Current (New Operator)</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Effective Score</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{agent.trustScore}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Verification</span>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded" style={{
                background: agent.currentOperatorVerification === 'verified' ? 'rgba(6,182,212,0.1)' : 'rgba(245,158,11,0.1)',
                color: agent.currentOperatorVerification === 'verified' ? 'var(--domain)' : 'var(--warning, #f59e0b)',
              }}>{agent.currentOperatorVerification || 'pending'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs pt-3 border-t" style={{ borderColor: 'rgba(30,41,59,0.5)', color: 'var(--text-dim)' }}>
        Trust scores and verification status are independently evaluated for each operator. Historical metrics are preserved for transparency.
      </div>
    </GlassCard>
  );
}

export { TransferStatusBadge, TRANSFER_TYPE_INFO, STATUS_COLORS };
