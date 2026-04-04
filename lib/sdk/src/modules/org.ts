/**
 * Org and Claim Lifecycle Module — Phase 3 SDK helpers
 *
 * getClaimHistory: get the immutable claim history for an agent
 * submitClaimDispute: submit a dispute for an agent claim
 * claimAgent: claim an unowned agent (associate with current user/org)
 * transferAgent: transfer an agent to a new org
 */
import { HttpClient } from "../utils/http.js";

export interface ClaimHistoryRecord {
  id: string;
  agentId: string;
  action: string;
  fromOwner: string | null;
  toOwner: string | null;
  performedByUserId: string | null;
  evidenceHash: string | null;
  notes: string | null;
  disputeStatus: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

export interface ClaimHistoryResult {
  agentId: string;
  history: ClaimHistoryRecord[];
}

export interface AgentClaimOptions {
  /** Optional: claim the agent on behalf of an org. */
  orgId?: string;
  /** Optional: evidence of ownership (e.g. DNS TXT record, challenge token). */
  proof?: string;
  /** Optional: claim notes for the audit log. */
  notes?: string;
}

export interface AgentTransferOptions {
  /** Target org ID to transfer the agent to. */
  targetOrgId: string;
  /** Optional: notes for the transfer audit log. */
  notes?: string;
}

export class OrgModule {
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Get the full immutable claim history for an agent.
   */
  async getClaimHistory(agentId: string): Promise<ClaimHistoryResult> {
    return this.http.get<ClaimHistoryResult>(`/api/v1/agents/${agentId}/claim-history`);
  }

  /**
   * Submit a dispute for an agent claim.
   */
  async submitClaimDispute(agentId: string, options?: {
    evidence?: string;
    notes?: string;
  }): Promise<{ success: boolean; historyId: string; disputeStatus: string }> {
    return this.http.post(`/api/v1/agents/${agentId}/claims/dispute`, options || {});
  }

  /**
   * Claim an unclaimed agent and associate it with the authenticated user or org.
   */
  async claimAgent(agentId: string, options?: AgentClaimOptions): Promise<{
    success: boolean;
    agentId: string;
    claimedAt: string;
    historyId?: string;
  }> {
    return this.http.post(`/api/v1/agents/${agentId}/claim`, {
      orgId: options?.orgId,
      proof: options?.proof,
      notes: options?.notes,
    });
  }

  /**
   * Transfer an agent to a different organization.
   * Requires the authenticated user to be the current owner.
   */
  async transferAgent(agentId: string, options: AgentTransferOptions): Promise<{
    success: boolean;
    agentId: string;
    targetOrgId: string;
    transferredAt: string;
    historyId?: string;
  }> {
    return this.http.post(`/api/v1/agents/${agentId}/transfer`, {
      targetOrgId: options.targetOrgId,
      notes: options.notes,
    });
  }
}
