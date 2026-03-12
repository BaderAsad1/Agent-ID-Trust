import { describe, it, expect, beforeAll } from 'vitest';

const TEST_TIMEOUT = 15000;
const BASE = 'http://localhost:8080/api/v1';
const HEADERS = {
  'Content-Type': 'application/json',
  'X-AgentID-User-Id': 'seed-user-1',
};

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...HEADERS, ...(opts.headers as Record<string, string> || {}) } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let agentId: string;
let agent2Id: string;
let inboxId: string;
let testLabelId: string;

describe('Agent Mail Integration Tests', () => {
  beforeAll(async () => {
    const res = await req('/agents');
    expect(res.status).toBe(200);
    const agents = res.body.agents;
    expect(agents.length).toBeGreaterThanOrEqual(2);
    agentId = agents.find((a: { handle: string }) => a.handle === 'research-agent')?.id;
    agent2Id = agents.find((a: { handle: string }) => a.handle === 'code-reviewer')?.id;
    expect(agentId).toBeDefined();
    expect(agent2Id).toBeDefined();
  });

  describe('Inbox', () => {
    it('should get or create inbox', async () => {
      const res = await req(`/mail/agents/${agentId}/inbox`);
      expect(res.status).toBe(200);
      expect(res.body.inbox).toBeDefined();
      expect(res.body.inbox.address).toContain('@agents.local');
      expect(res.body.inbox.addressLocalPart).toBe('research-agent');
      expect(res.body.inbox.addressDomain).toBe('agents.local');
      expect(res.body.inbox.status).toBe('active');
      inboxId = res.body.inbox.id;
    });

    it('should return inbox stats', async () => {
      const res = await req(`/mail/agents/${agentId}/inbox/stats`);
      expect(res.status).toBe(200);
      expect(res.body.messages).toBeDefined();
      expect(res.body.messages.total).toBeGreaterThanOrEqual(0);
      expect(res.body.threads).toBeDefined();
    });

    it('should update inbox settings', async () => {
      const res = await req(`/mail/agents/${agentId}/inbox`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Updated Research Inbox' }),
      });
      expect(res.status).toBe(200);
      expect(res.body.inbox.displayName).toBe('Updated Research Inbox');
    });
  });

  describe('Threads', () => {
    it('should list threads', async () => {
      const res = await req(`/mail/agents/${agentId}/threads`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.threads)).toBe(true);
      expect(res.body.threads.length).toBeGreaterThan(0);
    });

    it('should include lastMessage metadata per thread', async () => {
      const res = await req(`/mail/agents/${agentId}/threads`);
      expect(res.status).toBe(200);
      const thread = res.body.threads[0];
      expect(thread.lastMessage).toBeDefined();
      expect(thread.lastMessage.id).toBeDefined();
      expect(typeof thread.lastMessage.senderType).toBe('string');
      expect(typeof thread.lastMessage.snippet).toBe('string');
      expect(thread.lastMessage.snippet.length).toBeGreaterThan(0);
      expect(typeof thread.lastMessage.isRead).toBe('boolean');
      expect(thread.lastMessage.createdAt).toBeDefined();
      expect(Array.isArray(thread.labels)).toBe(true);
    });

    it('should get thread with messages', async () => {
      const listRes = await req(`/mail/agents/${agentId}/threads`);
      const threadId = listRes.body.threads[0].id;
      const res = await req(`/mail/agents/${agentId}/threads/${threadId}`);
      expect(res.status).toBe(200);
      expect(res.body.thread).toBeDefined();
      expect(res.body.thread.subject).toBeDefined();
      expect(res.body.thread.messages).toBeDefined();
      expect(res.body.thread.messages.length).toBeGreaterThan(0);
      expect(res.body.thread.unreadCount).toBeDefined();
    });

    it('should mark thread read', async () => {
      const listRes = await req(`/mail/agents/${agentId}/threads`);
      const threadId = listRes.body.threads[0].id;
      const res = await req(`/mail/agents/${agentId}/threads/${threadId}/read`, { method: 'POST' });
      expect(res.status).toBe(200);
    });
  });

  describe('Messages', () => {
    it('should list messages', async () => {
      const res = await req(`/mail/agents/${agentId}/messages`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages.length).toBeGreaterThan(0);
    });

    it('should get message detail with labels and attachments', async () => {
      const listRes = await req(`/mail/agents/${agentId}/messages`);
      const messageId = listRes.body.messages[0].id;
      const res = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.id).toBe(messageId);
      expect(res.body.message.body).toBeDefined();
      expect(res.body.labels).toBeDefined();
      expect(res.body.attachments).toBeDefined();
    });

    it('should send a new message', async () => {
      const res = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          recipientAddress: 'code-reviewer@agents.local',
          subject: 'Test message from integration tests',
          body: 'Hello from the integration test suite.',
          bodyFormat: 'text',
          direction: 'outbound',
          senderType: 'user',
        }),
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.subject).toBe('Test message from integration tests');
      expect(res.body.message.snippet).toBeDefined();
    });

    it('should mark message read/unread', async () => {
      const listRes = await req(`/mail/agents/${agentId}/messages`);
      const messageId = listRes.body.messages[0].id;
      const readRes = await req(`/mail/agents/${agentId}/messages/${messageId}/read`, {
        method: 'POST',
        body: JSON.stringify({ isRead: true }),
      });
      expect(readRes.status).toBe(200);
      expect(readRes.body.message.isRead).toBe(true);
      expect(readRes.body.message.readAt).toBeDefined();

      const unreadRes = await req(`/mail/agents/${agentId}/messages/${messageId}/read`, {
        method: 'POST',
        body: JSON.stringify({ isRead: false }),
      });
      expect(unreadRes.status).toBe(200);
      expect(unreadRes.body.message.isRead).toBe(false);
    });

    it('should get message events', async () => {
      const listRes = await req(`/mail/agents/${agentId}/messages`);
      const messageId = listRes.body.messages[0].id;
      const res = await req(`/mail/agents/${agentId}/messages/${messageId}/events`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.events)).toBe(true);
    });

    it('should archive a message', async () => {
      const listRes = await req(`/mail/agents/${agentId}/messages`);
      const messageId = listRes.body.messages[0].id;
      const res = await req(`/mail/agents/${agentId}/messages/${messageId}/archive`, { method: 'POST' });
      expect(res.status).toBe(200);
    });
  });

  describe('Labels', () => {
    it('should list labels with system labels', async () => {
      const res = await req(`/mail/agents/${agentId}/labels`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.labels)).toBe(true);
      const systemLabels = res.body.labels.filter((l: { isSystem: boolean }) => l.isSystem);
      expect(systemLabels.length).toBe(18);
    });

    it('should create a custom label', async () => {
      const labelName = `test-label-${Date.now()}`;
      const res = await req(`/mail/agents/${agentId}/labels`, {
        method: 'POST',
        body: JSON.stringify({ name: labelName, color: '#ff0000' }),
      });
      expect(res.status).toBe(201);
      expect(res.body.label.name).toBe(labelName);
      testLabelId = res.body.label.id;
    });

    it('should assign and remove label from message', async () => {
      expect(testLabelId).toBeDefined();
      const msgsRes = await req(`/mail/agents/${agentId}/messages`);
      const messageId = msgsRes.body.messages[0].id;

      const assignRes = await req(`/mail/agents/${agentId}/messages/${messageId}/labels/${testLabelId}`, { method: 'POST' });
      expect(assignRes.status).toBe(200);

      const removeRes = await req(`/mail/agents/${agentId}/messages/${messageId}/labels/${testLabelId}`, { method: 'DELETE' });
      expect(removeRes.status).toBe(200);
    });
  });

  describe('Webhooks', () => {
    it('should list webhooks', async () => {
      const res = await req(`/mail/agents/${agentId}/webhooks`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.webhooks)).toBe(true);
    });

    it('should reject webhook with private URL', async () => {
      const res = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'http://localhost:3000/webhook', events: ['message.received'] }),
      });
      expect(res.status).toBe(400);
    });

    it('should create and delete webhook with valid URL', async () => {
      const createRes = await req(`/mail/agents/${agentId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/webhook', events: ['message.received'], secret: 'test-secret' }),
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.webhook).toBeDefined();
      expect(createRes.body.webhook.url).toBe('https://example.com/webhook');

      const webhookId = createRes.body.webhook.id;
      const deleteRes = await req(`/mail/agents/${agentId}/webhooks/${webhookId}`, { method: 'DELETE' });
      expect(deleteRes.status).toBe(200);
    });
  });

  describe('Search', () => {
    it('should search messages by query', async () => {
      const res = await req(`/mail/agents/${agentId}/search?q=research`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
    });

    it('should search by direction filter', async () => {
      const res = await req(`/mail/agents/${agentId}/search?direction=inbound`);
      expect(res.status).toBe(200);
      res.body.messages.forEach((m: { direction: string }) => {
        expect(m.direction).toBe('inbound');
      });
    });

    it('should search with label filter', async () => {
      const labelsRes = await req(`/mail/agents/${agentId}/labels`);
      const inboxLabel = labelsRes.body.labels.find((l: { name: string }) => l.name === 'inbox');
      if (inboxLabel) {
        const res = await req(`/mail/agents/${agentId}/search?labelId=${inboxLabel.id}`);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('Message-to-Task Conversion', () => {
    it('should convert message to task', { timeout: TEST_TIMEOUT }, async () => {
      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: 'Task conversion test',
          body: 'This message should become a task.',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'user',
          senderAddress: 'tester@example.com',
        }),
      });
      expect(sendRes.status).toBe(201);
      const messageId = sendRes.body.message.id;

      const convertRes = await req(`/mail/agents/${agentId}/messages/${messageId}/convert-task`, { method: 'POST' });
      expect(convertRes.status).toBe(201);
      expect(convertRes.body.taskId).toBeDefined();

      const msgRes = await req(`/mail/agents/${agentId}/messages/${messageId}`);
      expect(msgRes.body.message.convertedTaskId).toBe(convertRes.body.taskId);
    });
  });

  describe('Thread Reply', () => {
    it('should reply to a thread', async () => {
      const threadsRes = await req(`/mail/agents/${agentId}/threads`);
      const threadId = threadsRes.body.threads[0].id;
      const initialCount = threadsRes.body.threads[0].messageCount;

      const replyRes = await req(`/mail/agents/${agentId}/threads/${threadId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body: 'This is a test reply from integration tests.' }),
      });
      expect(replyRes.status).toBe(201);
      expect(replyRes.body.message).toBeDefined();

      const threadRes = await req(`/mail/agents/${agentId}/threads/${threadId}`);
      expect(threadRes.body.thread.messageCount).toBe(initialCount + 1);
    });
  });

  describe('Access Control', () => {
    it('should deny access to other user agent inbox', async () => {
      const res = await fetch(`${BASE}/mail/agents/${agentId}/inbox`, {
        headers: { ...HEADERS, 'X-AgentID-User-Id': 'nonexistent-user' },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('End-to-End Happy Path', () => {
    it('should complete full mail lifecycle: inbox → send → thread → label → route → convert task', { timeout: TEST_TIMEOUT }, async () => {
      const inboxRes = await req(`/mail/agents/${agentId}/inbox`);
      expect(inboxRes.status).toBe(200);
      const inbox = inboxRes.body.inbox;
      expect(inbox.status).toBe('active');

      const sendRes = await req(`/mail/agents/${agentId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          subject: 'E2E test full lifecycle',
          body: 'End-to-end test message for full lifecycle verification.',
          bodyFormat: 'text',
          direction: 'inbound',
          senderType: 'agent',
          senderAddress: 'test-agent@agents.local',
          senderVerified: true,
          priority: 'high',
        }),
      });
      expect(sendRes.status).toBe(201);
      const message = sendRes.body.message;
      expect(message.snippet).toBeDefined();

      const threadsRes = await req(`/mail/agents/${agentId}/threads`);
      const thread = threadsRes.body.threads.find((t: { subject: string }) => t.subject === 'E2E test full lifecycle');
      expect(thread).toBeDefined();
      expect(thread.messageCount).toBeGreaterThanOrEqual(1);

      const threadRes = await req(`/mail/agents/${agentId}/threads/${thread.id}`);
      expect(threadRes.body.thread.messages.length).toBeGreaterThanOrEqual(1);

      const labelsRes = await req(`/mail/agents/${agentId}/labels`);
      const importantLabel = labelsRes.body.labels.find((l: { name: string }) => l.name === 'important');
      expect(importantLabel).toBeDefined();

      await req(`/mail/agents/${agentId}/messages/${message.id}/labels/${importantLabel.id}`, { method: 'POST' });

      const msgDetail = await req(`/mail/agents/${agentId}/messages/${message.id}`);
      const hasLabel = msgDetail.body.labels?.some((l: { id: string }) => l.id === importantLabel.id);
      expect(hasLabel).toBe(true);

      const routeRes = await req(`/mail/agents/${agentId}/messages/${message.id}/route`, { method: 'POST' });
      expect(routeRes.status).toBe(200);

      const convertRes = await req(`/mail/agents/${agentId}/messages/${message.id}/convert-task`, { method: 'POST' });
      expect(convertRes.status).toBe(201);
      expect(convertRes.body.taskId).toBeDefined();

      const finalMsg = await req(`/mail/agents/${agentId}/messages/${message.id}`);
      expect(finalMsg.body.message.convertedTaskId).toBe(convertRes.body.taskId);

      const eventsRes = await req(`/mail/agents/${agentId}/messages/${message.id}/events`);
      expect(eventsRes.body.events.length).toBeGreaterThanOrEqual(2);
    });
  });
});
