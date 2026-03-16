/**
 * ⚠️  DEVELOPMENT ONLY — DO NOT RUN IN PRODUCTION
 *
 * This script destructively wipes all tables and re-seeds with fixture data.
 * It is intended for local development and CI test environments only.
 */

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
  paymentLedgerTable,
  payoutLedgerTable,
  paymentIntentsTable,
  paymentAuthorizationsTable,
  webhookEventsTable,
  auditEventsTable,
  messageLabelAssignmentsTable,
  messageLabelsTable,
  messageEventsTable,
  messageAttachmentsTable,
  agentMessagesTable,
  agentThreadsTable,
  inboxWebhooksTable,
  inboundTransportEventsTable,
  outboundMessageDeliveriesTable,
  agentInboxesTable,
} from "@workspace/db/schema";

async function seed() {
  console.log("Seeding database...");

  await db.delete(outboundMessageDeliveriesTable);
  await db.delete(inboundTransportEventsTable);
  await db.delete(inboxWebhooksTable);
  await db.delete(messageEventsTable);
  await db.delete(messageAttachmentsTable);
  await db.delete(messageLabelAssignmentsTable);
  await db.delete(agentMessagesTable);
  await db.delete(agentThreadsTable);
  await db.delete(messageLabelsTable);
  await db.delete(agentInboxesTable);
  await db.delete(paymentLedgerTable);
  await db.delete(payoutLedgerTable);
  await db.delete(paymentAuthorizationsTable);
  await db.delete(paymentIntentsTable);
  await db.delete(auditEventsTable);
  await db.delete(webhookEventsTable);
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
      domain: "research-agent.getagent.id",
      baseDomain: "getagent.id",
      status: "active",
      provisionedAt: new Date(),
    },
    {
      agentId: agent2.id,
      domain: "code-reviewer.getagent.id",
      baseDomain: "getagent.id",
      status: "active",
      provisionedAt: new Date(),
    },
    {
      agentId: agent3.id,
      domain: "data-pipeline.getagent.id",
      baseDomain: "getagent.id",
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

  const [inbox1] = await db
    .insert(agentInboxesTable)
    .values({
      agentId: agent1.id,
      address: "research-agent@getagent.id",
      addressLocalPart: "research-agent",
      addressDomain: "getagent.id",
      displayName: "Research Agent Inbox",
      status: "active",
      routingRules: [
        {
          id: "rule-1",
          name: "Auto-label high-trust",
          conditions: [{ field: "sender_trust", operator: "gte", value: 80 }],
          actions: [{ type: "label", params: { label: "important" } }],
          priority: 1,
          enabled: true,
        },
      ],
    })
    .returning();

  const [inbox2] = await db
    .insert(agentInboxesTable)
    .values({
      agentId: agent2.id,
      address: "code-reviewer@getagent.id",
      addressLocalPart: "code-reviewer",
      addressDomain: "getagent.id",
      displayName: "Code Reviewer Inbox",
      status: "active",
    })
    .returning();

  console.log(`Created inboxes: ${inbox1.address}, ${inbox2.address}`);

  const systemLabels = [
    "inbox", "sent", "archived", "spam", "important", "tasks",
    "drafts", "flagged", "verified", "quarantine",
    "unread", "routed", "requires-approval",
    "paid", "marketplace", "jobs", "agent", "human",
  ];
  for (const agentId of [agent1.id, agent2.id]) {
    for (const name of systemLabels) {
      await db
        .insert(messageLabelsTable)
        .values({ agentId, name, isSystem: true })
        .onConflictDoNothing();
    }
  }

  const [customLabel1] = await db
    .insert(messageLabelsTable)
    .values({ agentId: agent1.id, name: "urgent", color: "#FF0000", isSystem: false })
    .returning();

  const [customLabel2] = await db
    .insert(messageLabelsTable)
    .values({ agentId: agent1.id, name: "follow-up", color: "#FFA500", isSystem: false })
    .returning();

  console.log("Created labels for agents.");

  const [thread1] = await db
    .insert(agentThreadsTable)
    .values({
      inboxId: inbox1.id,
      agentId: agent1.id,
      subject: "Research request: AI agent market trends",
      status: "open",
      messageCount: 3,
      unreadCount: 1,
      lastMessageAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      participantAgentIds: [agent3.id],
      participantUserIds: [user2.id],
    })
    .returning();

  const [thread2] = await db
    .insert(agentThreadsTable)
    .values({
      inboxId: inbox1.id,
      agentId: agent1.id,
      subject: "Data governance analysis follow-up",
      status: "open",
      messageCount: 2,
      unreadCount: 0,
      lastMessageAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      participantAgentIds: [agent3.id],
    })
    .returning();

  const [thread3] = await db
    .insert(agentThreadsTable)
    .values({
      inboxId: inbox2.id,
      agentId: agent2.id,
      subject: "PR #42 code review request",
      status: "open",
      messageCount: 2,
      unreadCount: 1,
      lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      participantUserIds: [user2.id],
    })
    .returning();

  console.log("Created threads.");

  const [msg1] = await db
    .insert(agentMessagesTable)
    .values({
      threadId: thread1.id,
      inboxId: inbox1.id,
      agentId: agent1.id,
      direction: "inbound",
      senderType: "user",
      senderUserId: user2.id,
      senderAddress: "bob@example.com",
      recipientAddress: inbox1.address,
      subject: "Research request: AI agent market trends",
      body: "Hi Research Agent, could you provide a comprehensive analysis of the AI agent market trends for Q1 2026? We need coverage of key players, market size estimates, and emerging capabilities.",
      bodyFormat: "text",
      isRead: true,
      deliveryStatus: "delivered",
      senderTrustScore: 62,
    })
    .returning();

  const [msg2] = await db
    .insert(agentMessagesTable)
    .values({
      threadId: thread1.id,
      inboxId: inbox1.id,
      agentId: agent1.id,
      direction: "outbound",
      senderType: "agent",
      senderAgentId: agent1.id,
      senderAddress: inbox1.address,
      recipientAddress: "bob@example.com",
      subject: "Re: Research request: AI agent market trends",
      body: "Hello Bob, I have begun processing your research request. Expected completion time: 90 minutes. I will cover the following areas: market sizing, competitive landscape, capability benchmarks, and trend forecasts.",
      bodyFormat: "text",
      isRead: true,
      deliveryStatus: "delivered",
      inReplyToId: msg1.id,
    })
    .returning();

  const [msg3] = await db
    .insert(agentMessagesTable)
    .values({
      threadId: thread1.id,
      inboxId: inbox1.id,
      agentId: agent1.id,
      direction: "inbound",
      senderType: "agent",
      senderAgentId: agent3.id,
      senderAddress: "data-pipeline@getagent.id",
      recipientAddress: inbox1.address,
      subject: "Re: Research request: AI agent market trends",
      body: "Research Agent, I have supplementary market data from my ETL pipeline. The latest dataset includes 2,500+ agent registrations across 12 platforms. Shall I forward the cleaned dataset?",
      bodyFormat: "text",
      isRead: false,
      deliveryStatus: "delivered",
      senderTrustScore: 62,
      inReplyToId: msg2.id,
    })
    .returning();

  const [msg4] = await db
    .insert(agentMessagesTable)
    .values({
      threadId: thread2.id,
      inboxId: inbox1.id,
      agentId: agent1.id,
      direction: "inbound",
      senderType: "agent",
      senderAgentId: agent3.id,
      senderAddress: "data-pipeline@getagent.id",
      recipientAddress: inbox1.address,
      subject: "Data governance analysis follow-up",
      body: "Here are the data governance compliance reports you requested. Attached is the summary covering GDPR, CCPA, and emerging AI-specific regulations.",
      bodyFormat: "text",
      isRead: true,
      deliveryStatus: "delivered",
      senderTrustScore: 62,
    })
    .returning();

  await db.insert(agentMessagesTable).values({
    threadId: thread2.id,
    inboxId: inbox1.id,
    agentId: agent1.id,
    direction: "outbound",
    senderType: "agent",
    senderAgentId: agent1.id,
    senderAddress: inbox1.address,
    recipientAddress: "data-pipeline@getagent.id",
    subject: "Re: Data governance analysis follow-up",
    body: "Thank you for the comprehensive reports. I have integrated the findings into my research database.",
    bodyFormat: "text",
    isRead: true,
    deliveryStatus: "delivered",
    inReplyToId: msg4.id,
  });

  const [msg6] = await db
    .insert(agentMessagesTable)
    .values({
      threadId: thread3.id,
      inboxId: inbox2.id,
      agentId: agent2.id,
      direction: "inbound",
      senderType: "user",
      senderUserId: user2.id,
      senderAddress: "bob@example.com",
      recipientAddress: inbox2.address,
      subject: "PR #42 code review request",
      body: "Please review PR #42 on github.com/example/repo. Focus on TypeScript type safety and potential security issues in the auth module.",
      bodyFormat: "text",
      isRead: true,
      deliveryStatus: "delivered",
    })
    .returning();

  await db.insert(agentMessagesTable).values({
    threadId: thread3.id,
    inboxId: inbox2.id,
    agentId: agent2.id,
    direction: "outbound",
    senderType: "agent",
    senderAgentId: agent2.id,
    senderAddress: inbox2.address,
    recipientAddress: "bob@example.com",
    subject: "Re: PR #42 code review request",
    body: "Review in progress. Initial scan detected 3 potential type-safety issues and 1 medium-severity security concern. Full report will be delivered within 30 minutes.",
    bodyFormat: "text",
    isRead: true,
    deliveryStatus: "delivered",
    inReplyToId: msg6.id,
  });

  console.log("Created messages.");

  const importantLabel = await db.query.messageLabelsTable.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.agentId, agent1.id), e(t.name, "important")),
  });
  if (importantLabel) {
    await db.insert(messageLabelAssignmentsTable).values({ messageId: msg1.id, labelId: importantLabel.id });
  }
  await db.insert(messageLabelAssignmentsTable).values({ messageId: msg3.id, labelId: customLabel1.id });
  await db.insert(messageLabelAssignmentsTable).values({ messageId: msg4.id, labelId: customLabel2.id });

  await db.insert(messageEventsTable).values([
    { messageId: msg1.id, eventType: "message.received", payload: { direction: "inbound", threadId: thread1.id } },
    { messageId: msg2.id, eventType: "message.sent", payload: { direction: "outbound", threadId: thread1.id } },
    { messageId: msg3.id, eventType: "message.received", payload: { direction: "inbound", threadId: thread1.id } },
    { messageId: msg1.id, eventType: "message.routed", payload: { ruleId: "auto-label-important", actions: ["label"] } },
    { messageId: msg4.id, eventType: "message.routed", payload: { ruleId: "auto-label-governance", actions: ["label"] } },
  ]);

  const routedLabel = await db.query.messageLabelsTable.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.agentId, agent1.id), e(t.name, "routed")),
  });
  if (routedLabel) {
    await db.insert(messageLabelAssignmentsTable).values([
      { messageId: msg1.id, labelId: routedLabel.id },
      { messageId: msg4.id, labelId: routedLabel.id },
    ]);
  }

  await db.insert(messageAttachmentsTable).values([
    {
      messageId: msg4.id,
      fileName: "governance-report-q4.pdf",
      mimeType: "application/pdf",
      sizeBytes: 245760,
      storageUrl: "https://storage.example.com/attachments/governance-report-q4.pdf",
    },
    {
      messageId: msg4.id,
      fileName: "compliance-checklist.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 18432,
      storageUrl: "https://storage.example.com/attachments/compliance-checklist.xlsx",
    },
    {
      messageId: msg6.id,
      fileName: "pr42-diff.patch",
      mimeType: "text/x-patch",
      sizeBytes: 8192,
      storageUrl: "https://storage.example.com/attachments/pr42-diff.patch",
    },
  ]);

  const [webhook1] = await db
    .insert(inboxWebhooksTable)
    .values({
      inboxId: inbox1.id,
      agentId: agent1.id,
      url: "https://hooks.example.com/research-agent/incoming",
      secretEncrypted: "seed_placeholder_encrypted_research",
      events: ["message.received", "message.routed", "message.converted_to_task"],
      status: "active",
    })
    .returning();

  await db.insert(inboxWebhooksTable).values({
    inboxId: inbox2.id,
    agentId: agent2.id,
    url: "https://hooks.example.com/code-reviewer/incoming",
    secretEncrypted: "seed_placeholder_encrypted_reviewer",
    events: ["message.received", "thread.updated"],
    status: "active",
  });

  const convertedTask = await db
    .insert(tasksTable)
    .values({
      recipientAgentId: agent1.id,
      senderUserId: user1.id,
      taskType: "research",
      payload: {
        title: "Research AI agent market trends",
        description: "Converted from message: " + msg1.subject,
      },
      deliveryStatus: "delivered",
      businessStatus: "accepted",
      originatingMessageId: msg1.id,
    })
    .returning();

  if (convertedTask.length > 0) {
    await db
      .update(agentMessagesTable)
      .set({ convertedTaskId: convertedTask[0].id })
      .where((await import("drizzle-orm")).eq(agentMessagesTable.id, msg1.id));

    const tasksLabel = await db.query.messageLabelsTable.findFirst({
      where: (t, { and: a, eq: e }) =>
        a(e(t.agentId, agent1.id), e(t.name, "tasks")),
    });
    if (tasksLabel) {
      await db.insert(messageLabelAssignmentsTable).values({
        messageId: msg1.id,
        labelId: tasksLabel.id,
      });
    }

    await db.insert(messageEventsTable).values({
      messageId: msg1.id,
      eventType: "message.converted_to_task",
      payload: { taskId: convertedTask[0].id },
    });
  }

  console.log("Created label assignments, events, attachments, webhooks, and converted tasks.");

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
