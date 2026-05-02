import { describe, expect, it } from "vitest";
import { serializeError } from "../middlewares/request-logger";

describe("serializeError", () => {
  it("returns undefined for nullish values", () => {
    expect(serializeError(null)).toBeUndefined();
    expect(serializeError(undefined)).toBeUndefined();
  });

  it("stringifies non-object errors", () => {
    expect(serializeError("boom")).toBe("boom");
    expect(serializeError(42)).toBe("42");
  });

  it("extracts standard error fields and includes stack at top level", () => {
    const e = new Error("kaboom");
    const s = serializeError(e);
    expect(typeof s).toBe("object");
    if (typeof s !== "object" || !s) throw new Error("expected object");
    expect(s.type).toBe("Error");
    expect(s.message).toBe("kaboom");
    expect(typeof s.stack).toBe("string");
  });

  it("recurses into err.cause and extracts pg.Error fields, omitting stack on inner causes", () => {
    const pgErr = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      detail: "Key (email)=(a@b.com) already exists.",
      severity: "ERROR",
      hint: "Use an upsert.",
      routine: "_bt_check_unique",
      schema: "public",
      table: "users",
      constraint: "users_email_key",
    });
    const drizzleErr = Object.assign(new Error("Failed query: insert into users ..."), {
      query: "insert into users (email) values ($1)",
      cause: pgErr,
    });

    const s = serializeError(drizzleErr);
    if (typeof s !== "object" || !s) throw new Error("expected object");

    expect(s.message).toBe("Failed query: insert into users ...");
    expect(s.query).toBe("insert into users (email) values ($1)");
    expect(typeof s.stack).toBe("string");

    const cause = s.cause;
    if (typeof cause !== "object" || !cause) throw new Error("expected cause object");
    expect(cause.code).toBe("23505");
    expect(cause.detail).toBe("Key (email)=(a@b.com) already exists.");
    expect(cause.severity).toBe("ERROR");
    expect(cause.hint).toBe("Use an upsert.");
    expect(cause.routine).toBe("_bt_check_unique");
    expect(cause.table).toBe("users");
    expect(cause.constraint).toBe("users_email_key");
    expect(cause.message).toBe("duplicate key value violates unique constraint");
    // Stack should not be duplicated at inner cause levels.
    expect(cause.stack).toBeUndefined();
  });

  it("respects depth limit on cause chains", () => {
    const root: Record<string, unknown> = { message: "root" };
    let head: Record<string, unknown> = root;
    for (let i = 0; i < 10; i++) {
      const next: Record<string, unknown> = { message: `level-${i}` };
      head.cause = next;
      head = next;
    }

    const s = serializeError(root);
    let cur: unknown = s;
    let depth = 0;
    while (cur && typeof cur === "object" && "cause" in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>).cause;
      depth++;
      if (depth > 20) break;
    }
    expect(cur).toBe("[CAUSE_DEPTH_LIMIT]");
  });

  it("detects circular cause references via WeakSet", () => {
    const a: Record<string, unknown> = { message: "a" };
    const b: Record<string, unknown> = { message: "b" };
    a.cause = b;
    b.cause = a;

    const s = serializeError(a);
    if (typeof s !== "object" || !s) throw new Error("expected object");
    const c1 = s.cause;
    if (typeof c1 !== "object" || !c1) throw new Error("expected cause object");
    expect(c1.cause).toBe("[CIRCULAR]");
  });

  it("truncates very long query strings", () => {
    const longQuery = "select ".repeat(1000);
    const e = Object.assign(new Error("q"), { query: longQuery });
    const s = serializeError(e);
    if (typeof s !== "object" || !s) throw new Error("expected object");
    expect(s.query?.endsWith("...[TRUNCATED]")).toBe(true);
    expect((s.query as string).length).toBeLessThan(longQuery.length);
  });

  it("does not include params (avoids leaking PII/secret values)", () => {
    const e = Object.assign(new Error("q"), { params: ["secret-pw", "agk_abc"] });
    const s = serializeError(e);
    if (typeof s !== "object" || !s) throw new Error("expected object");
    expect((s as Record<string, unknown>).params).toBeUndefined();
  });

  it("recurses into AggregateError-style errors arrays", () => {
    const child1 = Object.assign(new Error("first"), { code: "E1" });
    const child2 = Object.assign(new Error("second"), { code: "E2" });
    const agg = Object.assign(new Error("multi"), { errors: [child1, child2] });
    const s = serializeError(agg);
    if (typeof s !== "object" || !s) throw new Error("expected object");
    expect(Array.isArray(s.errors)).toBe(true);
    const errs = s.errors as Array<Record<string, unknown>>;
    expect(errs).toHaveLength(2);
    expect(errs[0].message).toBe("first");
    expect(errs[0].code).toBe("E1");
    expect(errs[1].message).toBe("second");
    expect(errs[1].code).toBe("E2");
  });
});
