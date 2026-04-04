/**
 * Test DB helpers — transaction-wrapped test isolation.
 *
 * Each integration test wraps its DB operations in a transaction that is
 * rolled back at the end of the test, leaving the DB clean.
 */
import { db } from "@workspace/db";

export type TestTx = typeof db;

/**
 * withTestTransaction — run a callback inside a DB transaction and roll it back.
 * Use this in beforeEach/afterEach or directly inside tests for isolation.
 *
 * Note: Because rollback happens automatically, no cleanup is needed.
 */
export async function withTestTransaction<T>(
  fn: (tx: TestTx) => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx as unknown as TestTx);
      throw new Error("__TEST_ROLLBACK__");
    });
  } catch (err) {
    if (err instanceof Error && err.message === "__TEST_ROLLBACK__") {
      return result!;
    }
    throw err;
  }
  return result!;
}

export { db };
