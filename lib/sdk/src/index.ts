export { AgentID } from "./client.js";
export { AgentIDError } from "./utils/http.js";
export { generateKeyPair, signChallenge, registerAgent } from "./utils/crypto.js";
export { formatPromptBlock } from "./utils/prompt-block.js";
export { MailModule } from "./modules/mail.js";
export { TaskModule } from "./modules/tasks.js";
export { TrustModule } from "./modules/trust.js";
export { ResolveModule } from "./modules/resolve.js";
export { MarketplaceModule } from "./modules/marketplace.js";
export { verifyControlPlaneInstruction } from "./modules/control-plane.js";
export {
  parseAgentClaims,
  verifyAgentToken,
  createRelayingPartyClient,
} from "./modules/auth.js";
export { OrgModule } from "./modules/org.js";
export { MppModule } from "./modules/mpp.js";

export type {
  AgentTokenClaims,
  TokenIntrospectionResult,
  RelayingPartyConfig,
} from "./modules/auth.js";

export type {
  ClaimHistoryRecord,
  ClaimHistoryResult,
  AgentClaimOptions,
  AgentTransferOptions,
} from "./modules/org.js";

export type {
  AgentIDConfig,
  InitResult,
  TrustTier,
  InboxInfo,
  TrustSignal,
  TrustData,
  BootstrapBundle,
  HeartbeatResponse,
  HeartbeatOptions,
  HeartbeatMailInfo,
  MailMessage,
  MailThread,
  InboxStats,
  SendMailOptions,
  ReplyMailOptions,
  ListThreadsOptions,
  ListMessagesOptions,
  Task,
  ListTasksOptions,
  SendTaskOptions,
  AgentPricing,
  ResolvedAgent,
  ResolutionResult,
  DiscoverOptions,
  DiscoverResult,
  AgentIDCredential,
  CredentialProof,
  CredentialSubject,
  RegisterResult,
  RegisterOptions,
  KeyPair,
  TaskHandler,
  MessageHandler,
  MarketplaceListing,
  ListListingsOptions,
  ListListingsResult,
  MarketplaceReview,
  ListReviewsResult,
  SpawnSubagentOptions,
  SpawnSubagentResult,
  SubagentInfo,
  ListSubagentsResult,
  ListSubagentsOptions,
  TerminateSubagentResult,
} from "./types.js";

export type {
  ControlPlaneInstruction,
  SignedControlPlaneInstruction,
  VerifyControlPlaneOptions,
} from "./modules/control-plane.js";

export type {
  MppPaymentRequirement,
  MppPaymentResult,
  MppCreateIntentOptions,
} from "./modules/mpp.js";
