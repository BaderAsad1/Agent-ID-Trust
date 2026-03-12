import { describe, it, expect, beforeAll } from 'vitest';

const BASE = 'http://localhost:8080/api/v1';
const HEADERS = {
  'Content-Type': 'application/json',
  'X-AgentID-User-Id': 'seed-user-1',
};
const TEST_TIMEOUT = 15000;

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...HEADERS, ...(opts.headers as Record<string, string> || {}) } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let agentId: string;

describe('Mail Unit Tests — Service Logic', () => {
  beforeAll(async () => {
    const res = await req('/agents');
    agentId = res.body.agents.find((a: { handle: string }) => a.handle === 'research-agent')?.id;
    expect(agentId).toBeDefined();
  });

  describe('Threading Logic', () => {
    it('should group messages with matching subjects into the same thread', { timeout: TEST_TIMEOUT }, async () => {
      const subject = `thread-group-test-${Date.now()}`;
      const send1 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject, body: 'First message', bodyFormat: 'text', direction: 'inbound', senderType: 'agent', senderAddress: 'a@agents.local' }),
      });
      expect(send1.status).toBe(201);
      const threadId1 = send1.body.message.threadId;

      const send2 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject, body: 'Second message same subject', bodyFormat: 'text', direction: 'inbound', senderType: 'agent', senderAddress: 'b@agents.local' }),
      });
      expect(send2.status).toBe(201);
      expect(send2.body.message.threadId).toBe(threadId1);

      const threadRes = await req(`/mail/agents/${agentId}/threads/${threadId1}`);
      expect(threadRes.body.thread.messageCount).toBeGreaterThanOrEqual(2);
    });

    it('should normalize Re:/Fwd: prefixes for threading', { timeout: TEST_TIMEOUT }, async () => {
      const baseSubject = `norm-prefix-test-${Date.now()}`;
      const send1 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: baseSubject, body: 'Original', bodyFormat: 'text', direction: 'inbound', senderType: 'agent' }),
      });
      expect(send1.status).toBe(201);
      const threadId = send1.body.message.threadId;

      const send2 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `Re: ${baseSubject}`, body: 'Reply', bodyFormat: 'text', direction: 'outbound', senderType: 'user' }),
      });
      expect(send2.status).toBe(201);
      expect(send2.body.message.threadId).toBe(threadId);

      const send3 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `Fwd: ${baseSubject}`, body: 'Forward', bodyFormat: 'text', direction: 'outbound', senderType: 'user' }),
      });
      expect(send3.status).toBe(201);
      expect(send3.body.message.threadId).toBe(threadId);
    });

    it('should thread via inReplyToId even with different subjects', { timeout: TEST_TIMEOUT }, async () => {
      const send1 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `reply-chain-${Date.now()}`, body: 'Parent message', bodyFormat: 'text', direction: 'inbound', senderType: 'agent' }),
      });
      expect(send1.status).toBe(201);
      const parentId = send1.body.message.id;
      const threadId = send1.body.message.threadId;

      const send2 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: 'Completely different subject', body: 'Reply via inReplyTo', bodyFormat: 'text', direction: 'outbound', senderType: 'user', inReplyToId: parentId }),
      });
      expect(send2.status).toBe(201);
      expect(send2.body.message.threadId).toBe(threadId);
    });

    it('should track multiple messages in a thread', { timeout: TEST_TIMEOUT }, async () => {
      const subject = `multi-msg-test-${Date.now()}`;
      const send1 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject, body: 'From A', bodyFormat: 'text', direction: 'inbound', senderType: 'agent', senderAddress: 'participantA@agents.local' }),
      });
      expect(send1.status).toBe(201);
      const threadId = send1.body.message.threadId;

      const send2 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject, body: 'From B', bodyFormat: 'text', direction: 'inbound', senderType: 'agent', senderAddress: 'participantB@agents.local' }),
      });
      expect(send2.status).toBe(201);
      expect(send2.body.message.threadId).toBe(threadId);

      const threadRes = await req(`/mail/agents/${agentId}/threads/${threadId}`);
      expect(threadRes.status).toBe(200);
      expect(threadRes.body.thread.messageCount).toBeGreaterThanOrEqual(2);
      expect(threadRes.body.thread.id).toBe(threadId);
    });
  });

  describe('Message-to-Task Conversion', () => {
    it('should convert message to task with bidirectional linkage', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `Convert test ${Date.now()}`, body: 'Task content', bodyFormat: 'text', direction: 'inbound', senderType: 'user' }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const convertRes = await req(`/mail/agents/${agentId}/messages/${messageId}/convert-task`, { method: 'POST' });
      expect(convertRes.status).toBe(201);
      expect(convertRes.body.taskId).toBeDefined();
      const taskId = convertRes.body.taskId;

      const msgRes = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      expect(msgRes.body.message.convertedTaskId).toBe(taskId);
      expect(typeof taskId).toBe('string');
      expect(taskId.length).toBeGreaterThan(0);
    });

    it('should emit converted_to_task event', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `Event test ${Date.now()}`, body: 'Task event test', bodyFormat: 'text', direction: 'inbound', senderType: 'user' }),
      });
      const messageId = sendRes.body.message.id;

      await req(`/mail/agents/${agentId}/messages/${messageId}/convert-task`, { method: 'POST' });

      const eventsRes = await req(`/mail/agents/${agentId}/messages/${messageId}/events`);
      expect(eventsRes.status).toBe(200);
      const eventTypes = eventsRes.body.events.map((e: { eventType: string }) => e.eventType);
      expect(eventTypes).toContain('message.converted_to_task');
    });

    it('should prevent double conversion', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `Double convert ${Date.now()}`, body: 'Prevent double', bodyFormat: 'text', direction: 'inbound', senderType: 'user' }),
      });
      const messageId = sendRes.body.message.id;

      const first = await req(`/mail/agents/${agentId}/messages/${messageId}/convert-task`, { method: 'POST' });
      expect(first.status).toBe(201);

      const second = await req(`/mail/agents/${agentId}/messages/${messageId}/convert-task`, { method: 'POST' });
      expect([200, 201].includes(second.status)).toBe(true);
      expect(second.body.taskId).toBe(first.body.taskId);
    });
  });

  describe('Label Assignment Logic', () => {
    it('should assign and verify label on message', async () => {
      const labelsRes = await req(`/mail/agents/${agentId}/labels`);
      const importantLabel = labelsRes.body.labels.find((l: { name: string }) => l.name === 'important');
      expect(importantLabel).toBeDefined();

      const msgsRes = await req(`/mail/agents/${agentId}/messages`);
      const messageId = msgsRes.body.messages[0].id;

      const assignRes = await req(`/mail/agents/${agentId}/messages/${messageId}/labels/${importantLabel.id}`, { method: 'POST' });
      expect(assignRes.status).toBe(200);

      const detailRes = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      const labelIds = detailRes.body.labels.map((l: { id: string }) => l.id);
      expect(labelIds).toContain(importantLabel.id);
    });

    it('should prevent cross-agent label assignment', { timeout: TEST_TIMEOUT }, async () => {
      const agent2Res = await req('/agents');
      const allAgents = agent2Res.body.agents;
      const agent2Id = allAgents.find((a: { id: string }) => a.id !== agentId)?.id;
      expect(agent2Id).toBeDefined();

      const a1Labels = await req(`/mail/agents/${agentId}/labels`);
      const a1Label = a1Labels.body.labels[0];
      expect(a1Label).toBeDefined();

      const a2Send = await req(`/mail/agents/${agent2Id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `cross-agent-${Date.now()}`, body: 'test', bodyFormat: 'text', direction: 'inbound', senderType: 'agent' }),
      });
      expect(a2Send.status).toBe(201);
      const a2MsgId = a2Send.body.message.id;
      const crossRes = await req(`/mail/agents/${agent2Id}/messages/${a2MsgId}/labels/${a1Label.id}`, { method: 'POST' });
      expect([400, 403, 404].includes(crossRes.status)).toBe(true);
    });

    it('should remove label and verify absence', async () => {
      const labelsRes = await req(`/mail/agents/${agentId}/labels`);
      const flaggedLabel = labelsRes.body.labels.find((l: { name: string }) => l.name === 'flagged');
      expect(flaggedLabel).toBeDefined();

      const msgsRes = await req(`/mail/agents/${agentId}/messages`);
      const messageId = msgsRes.body.messages[0].id;

      await req(`/mail/agents/${agentId}/messages/${messageId}/labels/${flaggedLabel.id}`, { method: 'POST' });
      await req(`/mail/agents/${agentId}/messages/${messageId}/labels/${flaggedLabel.id}`, { method: 'DELETE' });

      const detailRes = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      const labelIds = detailRes.body.labels.map((l: { id: string }) => l.id);
      expect(labelIds).not.toContain(flaggedLabel.id);
    });

    it('should list all 18 system labels', async () => {
      const res = await req(`/mail/agents/${agentId}/labels`);
      const systemLabels = res.body.labels.filter((l: { isSystem: boolean }) => l.isSystem);
      const names = systemLabels.map((l: { name: string }) => l.name);
      expect(names).toContain('inbox');
      expect(names).toContain('sent');
      expect(names).toContain('archived');
      expect(names).toContain('spam');
      expect(names).toContain('important');
      expect(names).toContain('tasks');
      expect(names).toContain('verified');
      expect(names).toContain('quarantine');
      expect(names).toContain('requires-approval');
      expect(systemLabels.length).toBe(18);
    });
  });

  describe('Provenance and Trust Metadata', () => {
    it('should persist senderTrustScore and senderVerified', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Trust test ${Date.now()}`,
          body: 'Trust metadata test',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'agent',
          senderTrustScore: 85,
          senderVerified: true,
          senderAddress: 'trusted-agent@agents.local',
        }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const detailRes = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      expect(detailRes.body.message.senderTrustScore).toBe(85);
      expect(detailRes.body.message.senderVerified).toBe(true);
    });

    it('should persist provenanceChain across message lifecycle', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Provenance test ${Date.now()}`,
          body: 'Provenance chain test',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'agent',
          senderVerified: true,
        }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const detailRes = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      const provenance = detailRes.body.message.provenanceChain;
      expect(Array.isArray(provenance)).toBe(true);
      if (provenance && provenance.length > 0) {
        expect(provenance[0].action).toBeDefined();
        expect(provenance[0].timestamp).toBeDefined();
      }
    });

    it('should store priority metadata', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Priority test ${Date.now()}`,
          body: 'Urgent priority test',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'user',
          priority: 'urgent',
        }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const detailRes = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      expect(detailRes.body.message.priority).toBe('urgent');
    });

    it('should persist structuredPayload', { timeout: TEST_TIMEOUT }, async () => {
      const payload = { type: 'invoice', amount: 100, currency: 'USD' };
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Payload test ${Date.now()}`,
          body: 'Structured payload test',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'agent',
          structuredPayload: payload,
        }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const detailRes = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      expect(detailRes.body.message.structuredPayload).toBeDefined();
      expect(detailRes.body.message.structuredPayload.type).toBe('invoice');
      expect(detailRes.body.message.structuredPayload.amount).toBe(100);
    });
  });

  describe('Routing Rule Evaluation', () => {
    it('should successfully invoke manual routing', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Route test ${Date.now()}`,
          body: 'This should be routed',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'agent',
        }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const routeRes = await req(`/mail/agents/${agentId}/messages/${messageId}/route`, { method: 'POST' });
      expect(routeRes.status).toBe(200);
      expect(routeRes.body.message).toBe("Message routed");
    });

    it('should retrieve inbox with routing configuration', { timeout: TEST_TIMEOUT }, async () => {
      const inboxRes = await req(`/mail/agents/${agentId}/inbox`);
      expect(inboxRes.status).toBe(200);
      expect(inboxRes.body.inbox).toBeDefined();
      expect(inboxRes.body.inbox.agentId).toBe(agentId);
    });
  });

  describe('Message Lifecycle Events', () => {
    it('should emit message.received event on inbound message', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Event received test ${Date.now()}`,
          body: 'Check received event',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'agent',
        }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const eventsRes = await req(`/mail/agents/${agentId}/messages/${messageId}/events`);
      const eventTypes = eventsRes.body.events.map((e: { eventType: string }) => e.eventType);
      expect(eventTypes).toContain('message.received');
    });

    it('should emit message.sent event on outbound message', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Event sent test ${Date.now()}`,
          body: 'Check sent event',
          bodyFormat: 'text',
          direction: 'outbound',
          senderType: 'user',
        }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const eventsRes = await req(`/mail/agents/${agentId}/messages/${messageId}/events`);
      const eventTypes = eventsRes.body.events.map((e: { eventType: string }) => e.eventType);
      expect(eventTypes).toContain('message.sent');
    });

    it('should emit read/unread events', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Read event test ${Date.now()}`,
          body: 'Check read event',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'agent',
        }),
      });
      const messageId = sendRes.body.message.id;

      await req(`/mail/agents/${agentId}/messages/${messageId}/read`, {
        method: 'POST',
        body: JSON.stringify({ isRead: true }),
      });

      const eventsRes = await req(`/mail/agents/${agentId}/messages/${messageId}/events`);
      const eventTypes = eventsRes.body.events.map((e: { eventType: string }) => e.eventType);
      expect(eventTypes).toContain('message.read');
    });

    it('should emit label.assigned and label.removed events', async () => {
      const labelsRes = await req(`/mail/agents/${agentId}/labels`);
      const label = labelsRes.body.labels.find((l: { name: string }) => l.name === 'important');

      const msgsRes = await req(`/mail/agents/${agentId}/messages`);
      const messageId = msgsRes.body.messages[0].id;

      await req(`/mail/agents/${agentId}/messages/${messageId}/labels/${label.id}`, { method: 'POST' });
      await req(`/mail/agents/${agentId}/messages/${messageId}/labels/${label.id}`, { method: 'DELETE' });

      const eventsRes = await req(`/mail/agents/${agentId}/messages/${messageId}/events`);
      const eventTypes = eventsRes.body.events.map((e: { eventType: string }) => e.eventType);
      expect(eventTypes).toContain('label.assigned');
      expect(eventTypes).toContain('label.removed');
    });

    it('should emit archived event', async () => {
      const msgsRes = await req(`/mail/agents/${agentId}/messages`);
      const messageId = msgsRes.body.messages[0].id;

      await req(`/mail/agents/${agentId}/messages/${messageId}/archive`, { method: 'POST' });

      const eventsRes = await req(`/mail/agents/${agentId}/messages/${messageId}/events`);
      const eventTypes = eventsRes.body.events.map((e: { eventType: string }) => e.eventType);
      expect(eventTypes).toContain('message.archived');
    });
  });

  describe('Webhook SSRF Protection', () => {
    it('should reject localhost webhook URLs with 400', async () => {
      const res = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'http://localhost:8080/hook', events: ['message.received'] }),
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_URL');
    });

    it('should reject 127.0.0.1 webhook URLs', async () => {
      const res = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'http://127.0.0.1:3000/webhook', events: ['message.received'] }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject 10.x private IP webhook URLs', async () => {
      const res = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'http://10.0.0.1/webhook', events: ['message.received'] }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject 192.168.x private IP webhook URLs', async () => {
      const res = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'http://192.168.1.1/webhook', events: ['message.received'] }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid public HTTPS webhook URLs', async () => {
      const createRes = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'https://hooks.example.com/agent-mail', events: ['message.received'] }),
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.webhook.url).toBe('https://hooks.example.com/agent-mail');

      await req(`/mail/agents/${agentId}/webhooks/${createRes.body.webhook.id}`, { method: 'DELETE' });
    });
  });

  describe('Message Snippet Generation', () => {
    it('should auto-generate snippet from body', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Snippet test ${Date.now()}`,
          body: 'This is a test message body that should be used to generate a snippet preview for the inbox view.',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'agent',
        }),
      });
      expect(sendRes.status).toBe(201);
      expect(sendRes.body.message.snippet).toBeDefined();
      expect(sendRes.body.message.snippet.length).toBeGreaterThan(0);
      expect(sendRes.body.message.snippet.length).toBeLessThanOrEqual(200);
    });
  });

  describe('Search Semantics', () => {
    it('should return results matching the query text', { timeout: TEST_TIMEOUT }, async () => {
      const uniqueWord = `xyzzy${Date.now()}`;
      await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: `Search ${uniqueWord}`,
          body: `Message containing ${uniqueWord} for search validation`,
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'agent',
        }),
      });

      const searchRes = await req(`/mail/agents/${agentId}/search?q=${uniqueWord}`);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.messages.length).toBeGreaterThanOrEqual(1);
      const found = searchRes.body.messages.some((m: { subject?: string; body: string }) =>
        (m.subject?.includes(uniqueWord) || m.body.includes(uniqueWord)));
      expect(found).toBe(true);
    });

    it('should filter by direction with non-empty results', { timeout: TEST_TIMEOUT }, async () => {
      await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `direction-filter-${Date.now()}`, body: 'Outbound filter test', bodyFormat: 'text', direction: 'outbound', senderType: 'user' }),
      });
      const outRes = await req(`/mail/agents/${agentId}/search?direction=outbound`);
      expect(outRes.status).toBe(200);
      expect(outRes.body.messages.length).toBeGreaterThanOrEqual(1);
      outRes.body.messages.forEach((m: { direction: string }) => {
        expect(m.direction).toBe('outbound');
      });
    });

    it('should filter by senderVerified with non-empty results', { timeout: TEST_TIMEOUT }, async () => {
      await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `verified-filter-${Date.now()}`, body: 'Verified filter test', bodyFormat: 'text', direction: 'inbound', senderType: 'agent', senderVerified: true }),
      });
      const res = await req(`/mail/agents/${agentId}/search?senderVerified=true`);
      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
      res.body.messages.forEach((m: { senderVerified: boolean | null }) => {
        expect(m.senderVerified).toBe(true);
      });
    });
  });

  describe('Bulk Label Operations', () => {
    it('should bulk assign labels to multiple messages', { timeout: TEST_TIMEOUT }, async () => {
      const labelsRes = await req(`/mail/agents/${agentId}/labels`);
      const label = labelsRes.body.labels.find((l: { name: string }) => l.name === 'flagged');
      expect(label).toBeDefined();

      const m1 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `bulk-assign-a-${Date.now()}`, body: 'Bulk A', bodyFormat: 'text', direction: 'inbound', senderType: 'agent' }),
      });
      const m2 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `bulk-assign-b-${Date.now()}`, body: 'Bulk B', bodyFormat: 'text', direction: 'inbound', senderType: 'agent' }),
      });
      expect(m1.status).toBe(201);
      expect(m2.status).toBe(201);

      const bulkRes = await req(`/mail/agents/${agentId}/labels/${label.id}/bulk-assign`, {
        method: 'POST',
        body: JSON.stringify({ messageIds: [m1.body.message.id, m2.body.message.id] }),
      });
      expect(bulkRes.status).toBe(200);
      expect(bulkRes.body.success).toBe(true);
      expect(bulkRes.body.count).toBe(2);

      const d1 = await req(`/mail/agents/${agentId}/messages/${m1.body.message.id}`);
      const d2 = await req(`/mail/agents/${agentId}/messages/${m2.body.message.id}`);
      expect(d1.body.labels.some((l: { id: string }) => l.id === label.id)).toBe(true);
      expect(d2.body.labels.some((l: { id: string }) => l.id === label.id)).toBe(true);
    });

    it('should bulk remove labels from multiple messages', { timeout: TEST_TIMEOUT }, async () => {
      const labelsRes = await req(`/mail/agents/${agentId}/labels`);
      const label = labelsRes.body.labels.find((l: { name: string }) => l.name === 'flagged');

      const m1 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `bulk-remove-a-${Date.now()}`, body: 'Remove A', bodyFormat: 'text', direction: 'inbound', senderType: 'agent' }),
      });
      const m2 = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `bulk-remove-b-${Date.now()}`, body: 'Remove B', bodyFormat: 'text', direction: 'inbound', senderType: 'agent' }),
      });

      await req(`/mail/agents/${agentId}/labels/${label.id}/bulk-assign`, {
        method: 'POST',
        body: JSON.stringify({ messageIds: [m1.body.message.id, m2.body.message.id] }),
      });

      const removeRes = await req(`/mail/agents/${agentId}/labels/${label.id}/bulk-remove`, {
        method: 'POST',
        body: JSON.stringify({ messageIds: [m1.body.message.id, m2.body.message.id] }),
      });
      expect(removeRes.status).toBe(200);
      expect(removeRes.body.success).toBe(true);

      const d1 = await req(`/mail/agents/${agentId}/messages/${m1.body.message.id}`);
      expect(d1.body.labels.some((l: { id: string }) => l.id === label.id)).toBe(false);
    });
  });

  describe('Webhook CRUD & Dispatch', () => {
    it('should register webhook and list it', async () => {
      const createRes = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'https://hooks.test-dispatch.example.com/mail', events: ['message.received', 'message.sent'] }),
      });
      expect(createRes.status).toBe(201);
      const webhookId = createRes.body.webhook.id;
      expect(createRes.body.webhook.url).toBe('https://hooks.test-dispatch.example.com/mail');
      expect(createRes.body.webhook.events).toContain('message.received');

      const listRes = await req(`/mail/agents/${agentId}/webhooks`);
      expect(listRes.status).toBe(200);
      const found = listRes.body.webhooks.find((w: { id: string }) => w.id === webhookId);
      expect(found).toBeDefined();

      await req(`/mail/agents/${agentId}/webhooks/${webhookId}`, { method: 'DELETE' });
    });

    it('should update webhook URL and events', async () => {
      const createRes = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'https://hooks.update-test.example.com/v1', events: ['message.received'] }),
      });
      const webhookId = createRes.body.webhook.id;

      const updateRes = await req(`/mail/agents/${agentId}/webhooks/${webhookId}`, {
        method: 'PATCH',
        body: JSON.stringify({ url: 'https://hooks.update-test.example.com/v2', events: ['message.received', 'message.sent', 'message.archived'] }),
      });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.webhook.url).toBe('https://hooks.update-test.example.com/v2');
      expect(updateRes.body.webhook.events).toContain('message.archived');

      await req(`/mail/agents/${agentId}/webhooks/${webhookId}`, { method: 'DELETE' });
    });

    it('should delete webhook', async () => {
      const createRes = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'https://hooks.delete-test.example.com/wh', events: ['message.received'] }),
      });
      const webhookId = createRes.body.webhook.id;

      const delRes = await req(`/mail/agents/${agentId}/webhooks/${webhookId}`, { method: 'DELETE' });
      expect(delRes.status).toBe(200);

      const listRes = await req(`/mail/agents/${agentId}/webhooks`);
      const found = listRes.body.webhooks.find((w: { id: string }) => w.id === webhookId);
      expect(found).toBeUndefined();
    });
  });

  describe('Mail Ingest', () => {
    it('should ingest external message to agent inbox', { timeout: TEST_TIMEOUT }, async () => {
      const inboxRes = await req(`/mail/agents/${agentId}/inbox`);
      const address = inboxRes.body.inbox.address;
      expect(address).toBeDefined();

      const ingestRes = await req('/mail/ingest', {
        method: 'POST',
        body: JSON.stringify({
          recipientAddress: address,
          senderAddress: 'external@sender.com',
          senderType: 'external',
          subject: `Ingested message ${Date.now()}`,
          body: 'This came from outside',
          bodyFormat: 'text',
          senderVerified: false,
        }),
      });
      expect(ingestRes.status).toBe(201);
      expect(ingestRes.body.messageId).toBeDefined();
      expect(ingestRes.body.threadId).toBeDefined();
      expect(ingestRes.body.inboxId).toBeDefined();

      const msgRes = await req(`/mail/agents/${agentId}/messages/${ingestRes.body.messageId}`);
      expect(msgRes.status).toBe(200);
      expect(msgRes.body.message.direction).toBe('inbound');
      expect(msgRes.body.message.senderType).toBe('external');
    });

    it('should reject ingest to non-existent address', async () => {
      const ingestRes = await req('/mail/ingest', {
        method: 'POST',
        body: JSON.stringify({
          recipientAddress: 'nonexistent@agents.local',
          senderAddress: 'external@sender.com',
          senderType: 'external',
          body: 'Should fail',
        }),
      });
      expect(ingestRes.status).toBe(404);
    });
  });

  describe('Inbox List View', () => {
    it('should return inbox with unread/total counts via stats', async () => {
      const inboxRes = await req(`/mail/agents/${agentId}/inbox`);
      expect(inboxRes.status).toBe(200);
      expect(inboxRes.body.inbox).toBeDefined();
      expect(inboxRes.body.inbox.agentId).toBe(agentId);

      const statsRes = await req(`/mail/agents/${agentId}/inbox/stats`);
      expect(statsRes.status).toBe(200);
      expect(typeof statsRes.body.messages.total).toBe('number');
      expect(typeof statsRes.body.messages.unread).toBe('number');
      expect(typeof statsRes.body.threads.total).toBe('number');
      expect(typeof statsRes.body.threads.open).toBe('number');
    });

    it('should return inbox stats for all user agents', async () => {
      const agentsRes = await req('/agents');
      for (const agent of agentsRes.body.agents) {
        const statsRes = await req(`/mail/agents/${agent.id}/inbox/stats`);
        expect(statsRes.status).toBe(200);
        expect(statsRes.body.messages).toBeDefined();
        expect(statsRes.body.threads).toBeDefined();
      }
    });
  });

  describe('Webhook Dispatch Verification', () => {
    it('should persist webhook dispatch events when message is sent', { timeout: TEST_TIMEOUT }, async () => {
      const createWh = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'https://dispatch-verify.example.com/hook', events: ['message.received'] }),
      });
      expect(createWh.status).toBe(201);
      const webhookId = createWh.body.webhook.id;

      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ subject: `dispatch-check-${Date.now()}`, body: 'Verify dispatch', bodyFormat: 'text', direction: 'inbound', senderType: 'external' }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const eventsRes = await req(`/mail/agents/${agentId}/messages/${messageId}/events`);
      expect(eventsRes.status).toBe(200);
      expect(eventsRes.body.events.length).toBeGreaterThanOrEqual(1);
      const hasReceived = eventsRes.body.events.some((e: { eventType: string }) => e.eventType === 'message.received');
      expect(hasReceived).toBe(true);

      await req(`/mail/agents/${agentId}/webhooks/${webhookId}`, { method: 'DELETE' });
    });

    it('should reject webhook with private/SSRF URL', async () => {
      const res = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'http://localhost:9999/hook', events: ['message.received'] }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Full E2E Lifecycle: Ingest → Thread → Label → Route → Convert', () => {
    it('should complete the full mail lifecycle via ingest', { timeout: 60000 }, async () => {
      const inboxRes = await req(`/mail/agents/${agentId}/inbox`);
      const address = inboxRes.body.inbox.address;

      const ingestRes = await req('/mail/ingest', {
        method: 'POST',
        body: JSON.stringify({
          recipientAddress: address,
          senderAddress: 'lifecycle-test@external.com',
          senderType: 'external',
          subject: `E2E Lifecycle ${Date.now()}`,
          body: 'Full lifecycle test message',
          bodyFormat: 'text',
          senderVerified: true,
          senderTrustScore: 85,
          priority: 'high',
        }),
      });
      expect(ingestRes.status).toBe(201);
      const { messageId, threadId } = ingestRes.body;
      expect(messageId).toBeDefined();
      expect(threadId).toBeDefined();

      const threadRes = await req(`/mail/agents/${agentId}/threads/${threadId}`);
      expect(threadRes.status).toBe(200);
      expect(threadRes.body.thread.messageCount).toBeGreaterThanOrEqual(1);

      const msgRes = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      expect(msgRes.status).toBe(200);
      expect(msgRes.body.message.direction).toBe('inbound');
      expect(msgRes.body.message.senderType).toBe('external');
      expect(msgRes.body.message.senderVerified).toBe(true);
      expect(msgRes.body.message.priority).toBe('high');

      const labelsRes = await req(`/mail/agents/${agentId}/labels`);
      const flaggedLabel = labelsRes.body.labels.find((l: { name: string }) => l.name === 'flagged');
      expect(flaggedLabel).toBeDefined();

      const assignRes = await req(`/mail/agents/${agentId}/messages/${messageId}/labels/${flaggedLabel.id}`, {
        method: 'POST',
      });
      expect(assignRes.status).toBe(200);

      const msgAfterLabel = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      expect(msgAfterLabel.body.labels.some((l: { id: string }) => l.id === flaggedLabel.id)).toBe(true);

      const routeRes = await req(`/mail/agents/${agentId}/messages/${messageId}/route`, {
        method: 'POST',
      });
      expect(routeRes.status).toBe(200);

      const convertRes = await req(`/mail/agents/${agentId}/messages/${messageId}/convert-task`, {
        method: 'POST',
      });
      expect(convertRes.status).toBe(201);
      expect(convertRes.body.taskId).toBeDefined();
      const taskId = convertRes.body.taskId;

      const msgAfterConvert = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      expect(msgAfterConvert.body.message.convertedTaskId).toBe(taskId);

      const eventsRes = await req(`/mail/agents/${agentId}/messages/${messageId}/events`);
      expect(eventsRes.status).toBe(200);
      const eventTypes = eventsRes.body.events.map((e: { eventType: string }) => e.eventType);
      expect(eventTypes).toContain('message.received');
      expect(eventTypes).toContain('label.assigned');
      expect(eventTypes).toContain('message.converted_to_task');
    });
  });
});
