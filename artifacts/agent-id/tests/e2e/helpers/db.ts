import { Client } from "pg";
import { randomBytes } from "node:crypto";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set to run e2e tests. Provision a Replit Postgres database first.",
  );
}

const DATABASE_URL = process.env.DATABASE_URL;

export interface SeededTestUser {
  suffix: string;
  userId: string;
  agentId: string;
  sid: string;
  email: string;
  handle: string;
}

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Seeds a fully-functional 'pro' plan user, an active subscription, an
 * 'active'+'verified' agent, and a session row. Returns the values the test
 * needs to drive the browser. The session id (`sid`) is a 64-char hex string
 * the test will set as a cookie on the browser context before navigating.
 *
 * Plan gating in this app is read from the `subscriptions` table (NOT
 * `users.plan`). Without an `active` subscription, mail endpoints return 429.
 */
export async function seedPaidUserWithAgent(): Promise<SeededTestUser> {
  const suffix = randomBytes(4).toString("hex");
  const sid = randomBytes(32).toString("hex");
  const email = `test-mail-${suffix}@test-agentid.invalid`;
  const handle = `qa_mail_${suffix}`.slice(0, 32);
  const sess = {
    user: {
      id: "",
      provider: "test",
      providerId: `test_${suffix}`,
      username: handle,
      displayName: `QA Mail ${suffix}`,
      email,
      avatarUrl: null,
    },
  };

  return withDb(async (client) => {
    const userRes = await client.query<{ id: string }>(
      `INSERT INTO users (provider, provider_id, email, display_name, username, plan, email_verified)
       VALUES ('test', $1, $2, $3, $4, 'pro', true)
       RETURNING id`,
      [`test_${suffix}`, email, `QA Mail ${suffix}`, handle],
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO subscriptions (user_id, plan, status, provider, current_period_start, current_period_end)
       VALUES ($1, 'pro', 'active', 'test', NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days')`,
      [userId],
    );

    const agentRes = await client.query<{ id: string }>(
      `INSERT INTO agents (user_id, handle, display_name, status, verification_status, trust_tier, is_public)
       VALUES ($1, $2, $3, 'active', 'verified', 'basic', false)
       RETURNING id`,
      [userId, handle, `QA Mail Agent ${suffix}`],
    );
    const agentId = agentRes.rows[0].id;

    sess.user.id = userId;
    await client.query(
      `INSERT INTO sessions (sid, sess, expire) VALUES ($1, $2::jsonb, NOW() + INTERVAL '1 day')`,
      [sid, JSON.stringify(sess)],
    );

    return { suffix, userId, agentId, sid, email, handle };
  });
}

/**
 * Removes everything seedPaidUserWithAgent created plus any messages,
 * threads, inboxes, and attachments produced by the test run. Best-effort —
 * never throws, so test teardown doesn't mask the original failure.
 */
export async function cleanupSeededUser(user: SeededTestUser): Promise<void> {
  try {
    await withDb(async (client) => {
      await client.query(
        `DELETE FROM message_attachments
         WHERE message_id IN (SELECT id FROM agent_messages WHERE agent_id = $1)`,
        [user.agentId],
      );
      await client.query(`DELETE FROM agent_messages WHERE agent_id = $1`, [user.agentId]);
      await client.query(
        `DELETE FROM agent_threads
         WHERE inbox_id IN (SELECT id FROM agent_inboxes WHERE agent_id = $1)`,
        [user.agentId],
      );
      await client.query(`DELETE FROM agent_inboxes WHERE agent_id = $1`, [user.agentId]);
      await client.query(`DELETE FROM agents WHERE id = $1`, [user.agentId]);
      await client.query(`DELETE FROM subscriptions WHERE user_id = $1`, [user.userId]);
      await client.query(`DELETE FROM sessions WHERE sid = $1`, [user.sid]);
      await client.query(`DELETE FROM users WHERE id = $1`, [user.userId]);
    });
  } catch (err) {
    // Best-effort cleanup; surface but don't throw.
    // eslint-disable-next-line no-console
    console.warn("[e2e cleanup] failed:", err instanceof Error ? err.message : err);
  }
}

export interface AttachmentRow {
  id: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Returns attachment rows for the latest outbound message the agent has sent.
 */
export async function fetchLatestOutboundAttachments(
  agentId: string,
): Promise<AttachmentRow[]> {
  return withDb(async (client) => {
    const res = await client.query<{
      id: string;
      message_id: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
    }>(
      `SELECT a.id, a.message_id, a.file_name, a.mime_type, a.size_bytes
       FROM message_attachments a
       JOIN agent_messages m ON m.id = a.message_id
       WHERE m.agent_id = $1 AND m.direction = 'outbound'
       ORDER BY m.created_at DESC, a.created_at DESC`,
      [agentId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      messageId: r.message_id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes),
    }));
  });
}
