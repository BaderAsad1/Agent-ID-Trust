export { AgentID } from "./client.js";
export { AgentIDError } from "./utils/http.js";
export { generateKeyPair, signChallenge, registerAgent } from "./utils/crypto.js";
export { formatPromptBlock } from "./utils/prompt-block.js";
export { MailModule } from "./modules/mail.js";
export { TaskModule } from "./modules/tasks.js";
export { TrustModule } from "./modules/trust.js";
export { ResolveModule } from "./modules/resolve.js";
export { MarketplaceModule } from "./modules/marketplace.js";
export { HandleModule } from "./modules/handles.js";
export { WalletModule } from "./modules/wallet.js";
export { BillingModule } from "./modules/billing.js";
export { ApiKeysModule } from "./modules/api-keys.js";
export { OAuthClientsModule } from "./modules/oauth-clients.js";
export { OrganizationsModule } from "./modules/organizations.js";
export { FleetModule } from "./modules/fleet.js";
export { JobsModule } from "./modules/jobs.js";
export { DomainsModule } from "./modules/domains.js";
export { VerificationModule } from "./modules/verification.js";
export { verifyControlPlaneInstruction } from "./modules/control-plane.js";
export {
  parseAgentClaims,
  parseUserClaims,
  verifyAgentToken,
  verifyUserToken,
  createRelayingPartyClient,
} from "./modules/auth.js";
export { OrgModule } from "./modules/org.js";
export { MppModule } from "./modules/mpp.js";

export type {
  AgentIDTokenType,
  AgentTokenClaims,
  UserTokenClaims,
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
  HandleAvailability,
  OwnedHandle,
  ListHandlesResult,
  RequestMintResult,
  HandleCheckOptions,
} from "./modules/handles.js";

export type {
  WalletInfo,
  WalletBalance,
  WalletTransaction,
  WalletTransactionsResult,
  SpendingRule,
  ListSpendingRulesResult,
  CreateSpendingRuleOptions,
} from "./modules/wallet.js";

export type {
  CreateListingOptions,
  UpdateListingOptions,
  SubmitReviewOptions,
  CreateOrderOptions,
  MarketplaceOrder,
} from "./modules/marketplace.js";

export type {
  PlansResult,
  PlanDetails,
  HandlePricingTier,
  SubscriptionInfo,
  CheckoutOptions,
  HandleCheckoutOptions,
  HandleCheckoutResult,
  CryptoCheckoutOptions,
  AgentBillingStatus,
} from "./modules/billing.js";

export type {
  ApiKey,
  CreatedApiKey,
  CreateApiKeyOptions,
  ListApiKeysResult,
} from "./modules/api-keys.js";

export type {
  GrantType,
  OAuthClient,
  RegisterOAuthClientOptions,
  RegisteredOAuthClient,
  UpdateOAuthClientOptions,
  ListOAuthClientsResult,
} from "./modules/oauth-clients.js";

export type {
  Organization,
  OrgWithAgents,
  OrgMember,
  CreateOrganizationOptions,
} from "./modules/organizations.js";

export type {
  SubHandleAgent,
  FleetEntry,
  ListFleetsResult,
  CreateSubHandleOptions,
} from "./modules/fleet.js";

export type {
  Job,
  Proposal,
  ListJobsOptions,
  ListJobsResult,
  CreateJobOptions,
  UpdateJobOptions,
  CreateProposalOptions,
  ListProposalsResult,
} from "./modules/jobs.js";

export type {
  AgentDomain,
  DomainStatus,
} from "./modules/domains.js";

export type {
  VerificationChallenge,
  VerificationResult,
} from "./modules/verification.js";

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
  ErrorHandler,
  MarketplaceListing,
  ListListingsOptions,
  ListListingsResult,
  MarketplaceReview,
  SpawnSubagentOptions,
  SpawnSubagentResult,
  SubagentInfo,
  ListSubagentsResult,
  ListSubagentsOptions,
  TerminateSubagentResult,
} from "./types.js";
