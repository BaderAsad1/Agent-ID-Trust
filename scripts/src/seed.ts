import { db } from "@workspace/db";
import {
  usersTable,
  agentsTable,
  agentKeysTable,
  agentDomainsTable,
  agentActivityLogTable,
  agentReputationEventsTable,
  agentSubscriptionsTable,
  marketplaceListingsTable,
  marketplaceOrdersTable,
  marketplaceReviewsTable,
  jobPostsTable,
  jobProposalsTable,
  subscriptionsTable,
  tasksTable,
} from "@workspace/db/schema";

async function seed() {
  console.log("Seeding database...");

  await db.delete(agentReputationEventsTable);
  await db.delete(agentActivityLogTable);
  await db.delete(marketplaceReviewsTable);
  await db.delete(marketplaceOrdersTable);
  await db.delete(tasksTable);
  await db.delete(jobProposalsTable);
  await db.delete(jobPostsTable);
  await db.delete(marketplaceListingsTable);
  await db.delete(agentSubscriptionsTable);
  await db.delete(subscriptionsTable);
  await db.delete(agentKeysTable);
  await db.delete(agentDomainsTable);
  await db.delete(agentsTable);
  await db.delete(usersTable);
  console.log("Cleared existing data.");

  const [user1] = await db
    .insert(usersTable)
    .values({
      replitUserId: "seed-user-1",
      email: "alice@example.com",
      displayName: "Alice Chen",
      username: "alicechen",
      plan: "pro",
    })
    .returning();

  const [user2] = await db
    .insert(usersTable)
    .values({
      replitUserId: "seed-user-2",
      email: "bob@example.com",
      displayName: "Bob Rivera",
      username: "bobrivera",
      plan: "starter",
    })
    .returning();

  console.log(`Created users: ${user1.id}, ${user2.id}`);

  const [agent1] = await db
    .insert(agentsTable)
    .values({
      userId: user1.id,
      handle: "research-agent",
      displayName: "Research Agent",
      description:
        "Deep research agent specializing in academic papers, market analysis, and competitive intelligence.",
      status: "active",
      isPublic: true,
      endpointUrl: "https://ra.example.com/tasks",
      capabilities: ["research", "web-search", "summarization", "citation"],
      protocols: ["mcp", "a2a", "rest"],
      trustScore: 94,
      trustBreakdown: {
        verification: 20,
        longevity: 15,
        activity: 25,
        reputation: 20,
        completeness: 14,
      },
      trustTier: "elite",
      verificationStatus: "verified",
      verificationMethod: "key_challenge",
      verifiedAt: new Date(),
      tasksReceived: 2847,
      tasksCompleted: 2791,
    })
    .returning();

  const [agent2] = await db
    .insert(agentsTable)
    .values({
      userId: user1.id,
      handle: "code-reviewer",
      displayName: "Code Review Agent",
      description:
        "Automated code review agent for pull requests. Supports TypeScript, Python, Go, and Rust.",
      status: "active",
      isPublic: true,
      endpointUrl: "https://cr.example.com/review",
      capabilities: [
        "code-review",
        "static-analysis",
        "security-audit",
        "refactoring",
      ],
      protocols: ["rest", "a2a"],
      trustScore: 78,
      trustBreakdown: {
        verification: 20,
        longevity: 10,
        activity: 20,
        reputation: 18,
        completeness: 10,
      },
      trustTier: "trusted",
      verificationStatus: "verified",
      verificationMethod: "key_challenge",
      verifiedAt: new Date(),
      tasksReceived: 543,
      tasksCompleted: 521,
    })
    .returning();

  const [agent3] = await db
    .insert(agentsTable)
    .values({
      userId: user2.id,
      handle: "data-pipeline",
      displayName: "Data Pipeline Agent",
      description:
        "ETL and data pipeline agent. Transforms, cleans, and loads data across formats.",
      status: "active",
      isPublic: true,
      endpointUrl: "https://dp.example.com/ingest",
      capabilities: ["data-transform", "etl", "csv-parse", "api-integration"],
      protocols: ["rest"],
      trustScore: 62,
      trustBreakdown: {
        verification: 20,
        longevity: 5,
        activity: 15,
        reputation: 12,
        completeness: 10,
      },
      trustTier: "verified",
      verificationStatus: "verified",
      verificationMethod: "github",
      verifiedAt: new Date(),
      tasksReceived: 189,
      tasksCompleted: 175,
    })
    .returning();

  const [agent4] = await db
    .insert(agentsTable)
    .values({
      userId: user2.id,
      handle: "support-bot",
      displayName: "Customer Support Agent",
      description:
        "Customer support agent handling tickets, FAQs, and escalation routing.",
      status: "inactive",
      isPublic: false,
      capabilities: [
        "support",
        "ticket-routing",
        "faq",
        "escalation",
      ],
      protocols: ["rest"],
      trustScore: 35,
      trustBreakdown: {
        verification: 0,
        longevity: 5,
        activity: 10,
        reputation: 10,
        completeness: 10,
      },
      trustTier: "basic",
      verificationStatus: "unverified",
      tasksReceived: 42,
      tasksCompleted: 38,
    })
    .returning();

  console.log(
    `Created agents: ${agent1.handle}, ${agent2.handle}, ${agent3.handle}, ${agent4.handle}`,
  );

  await db.insert(agentDomainsTable).values([
    {
      agentId: agent1.id,
      domain: "research-agent.agentid.dev",
      baseDomain: "agentid.dev",
      status: "active",
      provisionedAt: new Date(),
    },
    {
      agentId: agent2.id,
      domain: "code-reviewer.agentid.dev",
      baseDomain: "agentid.dev",
      status: "active",
      provisionedAt: new Date(),
    },
    {
      agentId: agent3.id,
      domain: "data-pipeline.agentid.dev",
      baseDomain: "agentid.dev",
      status: "pending",
    },
  ]);

  await db.insert(subscriptionsTable).values([
    {
      userId: user1.id,
      plan: "pro",
      status: "active",
      provider: "stripe",
      billingInterval: "yearly",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    {
      userId: user2.id,
      plan: "starter",
      status: "active",
      provider: "stripe",
      billingInterval: "monthly",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  ]);

  await db.insert(agentSubscriptionsTable).values([
    {
      agentId: agent1.id,
      userId: user1.id,
      plan: "pro",
      status: "active",
      provider: "stripe",
      billingInterval: "yearly",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    {
      agentId: agent2.id,
      userId: user1.id,
      plan: "starter",
      status: "active",
      provider: "stripe",
      billingInterval: "monthly",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      agentId: agent3.id,
      userId: user2.id,
      plan: "starter",
      status: "cancelled",
      provider: "stripe",
      billingInterval: "monthly",
    },
  ]);

  const [listing1] = await db
    .insert(marketplaceListingsTable)
    .values({
      agentId: agent1.id,
      userId: user1.id,
      title: "Deep Research Report",
      description:
        "Comprehensive research report on any topic. Includes sources, analysis, and executive summary.",
      category: "Research",
      pitch: "Get a 10-page research report with cited sources in under 2 hours.",
      priceType: "fixed",
      priceAmount: "49.00",
      deliveryHours: 2,
      capabilities: ["research", "web-search", "summarization"],
      status: "active",
      views: 1247,
      totalHires: 89,
      avgRating: "4.90",
      reviewCount: 67,
    })
    .returning();

  const [listing2] = await db
    .insert(marketplaceListingsTable)
    .values({
      agentId: agent1.id,
      userId: user1.id,
      title: "Competitive Intelligence Brief",
      description:
        "Detailed competitive analysis of up to 5 companies. Market positioning, SWOT, and strategic recommendations.",
      category: "Research",
      priceType: "fixed",
      priceAmount: "129.00",
      deliveryHours: 24,
      capabilities: ["research", "web-search", "citation"],
      status: "active",
      views: 834,
      totalHires: 34,
      avgRating: "4.80",
      reviewCount: 28,
    })
    .returning();

  await db.insert(marketplaceListingsTable).values([
    {
      agentId: agent2.id,
      userId: user1.id,
      title: "PR Code Review",
      description:
        "Automated code review for your pull request. Security, performance, and style checks.",
      category: "Code",
      priceType: "per_task",
      priceAmount: "15.00",
      deliveryHours: 1,
      capabilities: ["code-review", "static-analysis"],
      status: "active",
      views: 567,
      totalHires: 156,
      avgRating: "4.70",
      reviewCount: 112,
    },
    {
      agentId: agent2.id,
      userId: user1.id,
      title: "Security Audit",
      description:
        "Deep security analysis of your codebase. Vulnerability detection and remediation guidance.",
      category: "Code",
      priceType: "fixed",
      priceAmount: "299.00",
      deliveryHours: 48,
      capabilities: ["security-audit", "code-review"],
      status: "active",
      views: 312,
      totalHires: 18,
      avgRating: "4.95",
      reviewCount: 15,
    },
    {
      agentId: agent3.id,
      userId: user2.id,
      title: "CSV to API Pipeline",
      description:
        "Transform CSV data into a clean REST API. Automatic schema detection and validation.",
      category: "Data",
      priceType: "fixed",
      priceAmount: "79.00",
      deliveryHours: 4,
      capabilities: ["data-transform", "csv-parse", "api-integration"],
      status: "active",
      views: 234,
      totalHires: 45,
      avgRating: "4.60",
      reviewCount: 32,
    },
    {
      agentId: agent3.id,
      userId: user2.id,
      title: "Data Cleaning & Normalization",
      description:
        "Clean, deduplicate, and normalize messy datasets. Supports CSV, JSON, and Excel.",
      category: "Data",
      priceType: "hourly",
      priceAmount: "25.00",
      deliveryHours: 8,
      capabilities: ["data-transform", "etl"],
      status: "active",
      views: 189,
      totalHires: 23,
      avgRating: "4.50",
      reviewCount: 19,
    },
  ]);

  const [order1] = await db
    .insert(marketplaceOrdersTable)
    .values({
      listingId: listing1.id,
      buyerUserId: user2.id,
      sellerUserId: user1.id,
      agentId: agent1.id,
      taskDescription: "Research report on AI agent ecosystem trends 2025-2026",
      priceAmount: "49.00",
      platformFee: "4.90",
      sellerPayout: "44.10",
      status: "completed",
      paymentProvider: "stripe",
      completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    })
    .returning();

  await db.insert(marketplaceReviewsTable).values({
    orderId: order1.id,
    listingId: listing1.id,
    reviewerId: user2.id,
    agentId: agent1.id,
    rating: 5,
    comment:
      "Excellent research quality. Comprehensive sources and clear analysis. Delivered in 90 minutes.",
  });

  await db.insert(jobPostsTable).values([
    {
      posterUserId: user2.id,
      title: "Weekly Market Research Reports",
      description:
        "Need an agent to produce weekly market research reports on the fintech sector.",
      category: "Research",
      budgetMin: "200.00",
      budgetMax: "500.00",
      deadlineHours: 168,
      requiredCapabilities: ["research", "web-search"],
      minTrustScore: 70,
      verifiedOnly: true,
      status: "open",
      proposalsCount: 3,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    {
      posterUserId: user1.id,
      title: "Automated Security Scanning Pipeline",
      description:
        "Looking for an agent to run continuous security scans on our repositories.",
      category: "Code",
      budgetFixed: "150.00",
      deadlineHours: 72,
      requiredCapabilities: ["security-audit", "code-review"],
      minTrustScore: 80,
      verifiedOnly: true,
      status: "open",
      proposalsCount: 1,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      posterUserId: user2.id,
      title: "Data Migration: Legacy CSV to PostgreSQL",
      description:
        "Migrate 50K+ rows of legacy CSV data into a normalized PostgreSQL schema.",
      category: "Data",
      budgetFixed: "300.00",
      deadlineHours: 48,
      requiredCapabilities: ["data-transform", "etl"],
      status: "filled",
      proposalsCount: 5,
    },
  ]);

  await db.insert(tasksTable).values([
    {
      recipientAgentId: agent1.id,
      senderUserId: user2.id,
      taskType: "research",
      payload: {
        topic: "AI agent infrastructure market size",
        format: "report",
      },
      deliveryStatus: "acknowledged",
      businessStatus: "completed",
      result: { reportUrl: "https://example.com/reports/ai-infra-2025.pdf" },
      forwardedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      acknowledgedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      respondedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      relatedOrderId: order1.id,
    },
    {
      recipientAgentId: agent2.id,
      senderUserId: user2.id,
      taskType: "code-review",
      payload: {
        prUrl: "https://github.com/example/repo/pull/42",
        language: "typescript",
      },
      deliveryStatus: "delivered",
      businessStatus: "accepted",
      forwardedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      recipientAgentId: agent1.id,
      senderAgentId: agent3.id,
      taskType: "research",
      payload: { topic: "Data governance best practices", format: "summary" },
      deliveryStatus: "pending",
      businessStatus: "pending",
    },
  ]);

  await db.insert(agentActivityLogTable).values([
    {
      agentId: agent1.id,
      eventType: "agent_created",
      payload: { handle: "research-agent" },
      signature: "hmac_placeholder_1",
    },
    {
      agentId: agent1.id,
      eventType: "verification_completed",
      payload: { method: "key_challenge" },
      signature: "hmac_placeholder_2",
    },
    {
      agentId: agent1.id,
      eventType: "task_completed",
      payload: { taskType: "research", orderId: order1.id },
      signature: "hmac_placeholder_3",
    },
    {
      agentId: agent2.id,
      eventType: "agent_created",
      payload: { handle: "code-reviewer" },
      signature: "hmac_placeholder_4",
    },
    {
      agentId: agent2.id,
      eventType: "verification_completed",
      payload: { method: "key_challenge" },
      signature: "hmac_placeholder_5",
    },
  ]);

  await db.insert(agentReputationEventsTable).values([
    {
      agentId: agent1.id,
      eventType: "task_completed",
      delta: 2,
      reason: "Successfully completed research task",
    },
    {
      agentId: agent1.id,
      eventType: "review_received",
      delta: 3,
      reason: "5-star review from buyer",
    },
    {
      agentId: agent2.id,
      eventType: "task_completed",
      delta: 1,
      reason: "Completed code review",
    },
    {
      agentId: agent3.id,
      eventType: "verification_completed",
      delta: 5,
      reason: "GitHub verification completed",
    },
  ]);

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
