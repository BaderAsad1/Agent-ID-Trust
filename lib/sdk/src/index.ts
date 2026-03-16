export { AgentID } from "./client.js";
export { AgentIDError } from "./utils/http.js";
export { generateKeyPair, signChallenge, registerAgent } from "./utils/crypto.js";
export { formatPromptBlock } from "./utils/prompt-block.js";
export { MailModule } from "./modules/mail.js";
export { TaskModule } from "./modules/tasks.js";
export { TrustModule } from "./modules/trust.js";
export { ResolveModule } from "./modules/resolve.js";
export { MarketplaceModule } from "./modules/marketplace.js";

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
