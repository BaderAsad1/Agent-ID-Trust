export function normalizeSubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  return subject.replace(/^(re|fwd|fw)\s*:\s*/gi, "").trim() || null;
}

export interface ConditionInput {
  field: string;
  operator: string;
  value: unknown;
}

export interface MessageFieldValues {
  senderType?: string | null;
  senderTrustScore?: number | null;
  subject?: string | null;
  direction?: string | null;
  senderVerified?: boolean | null;
  priority?: string | null;
  senderAddress?: string | null;
  body?: string | null;
}

export function evaluateConditionSync(
  messageFields: MessageFieldValues,
  cond: ConditionInput,
): boolean | null {
  if (cond.field === "label") return null;

  let value: string | number | boolean | null | undefined;

  switch (cond.field) {
    case "sender_type":
      value = messageFields.senderType;
      break;
    case "sender_trust":
      value = messageFields.senderTrustScore;
      break;
    case "subject":
      value = messageFields.subject;
      break;
    case "direction":
      value = messageFields.direction;
      break;
    case "sender_verified":
      value = messageFields.senderVerified;
      break;
    case "priority":
      value = messageFields.priority;
      break;
    case "sender_address":
      value = messageFields.senderAddress;
      break;
    case "body":
      value = messageFields.body;
      break;
    default:
      return false;
  }

  if (value === null || value === undefined) return false;

  if (typeof value === "boolean") {
    return cond.operator === "eq"
      ? value === (cond.value === true || cond.value === "true")
      : value !== (cond.value === true || cond.value === "true");
  }

  switch (cond.operator) {
    case "eq":
      return String(value) === String(cond.value);
    case "neq":
      return String(value) !== String(cond.value);
    case "gt":
      return Number(value) > Number(cond.value);
    case "lt":
      return Number(value) < Number(cond.value);
    case "gte":
      return Number(value) >= Number(cond.value);
    case "lte":
      return Number(value) <= Number(cond.value);
    case "contains":
      return String(value).toLowerCase().includes(String(cond.value).toLowerCase());
    case "matches":
      try {
        return new RegExp(String(cond.value), "i").test(String(value));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function generateSnippet(body: string, maxLen = 200): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 3) + "..." : clean;
}

export function isPrivateOrLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") return true;
    if (/^10\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
    return false;
  } catch {
    return true;
  }
}
