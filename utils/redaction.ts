const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /access_token/i,
  /refresh_token/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /secret/i,
  /otp/i,
  /cvv/i,
  /\bpan\b/i,
  /id_number/i,
];

const EMAIL_KEY = /email/i;
const PHONE_KEY = /phone|mobile|msisdn/i;
const CARD_KEY = /card|credit_card|debit_card/i;

export function redactValue(value: unknown, key = ""): unknown {
  if (value == null) return value;

  if (EMAIL_KEY.test(key)) return "[REDACTED_EMAIL]";
  if (PHONE_KEY.test(key)) return "[REDACTED_PHONE]";
  if (CARD_KEY.test(key)) return "[REDACTED_CARD]";
  if (/token/i.test(key)) return "[REDACTED_TOKEN]";
  if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) return "[REDACTED]";

  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

export function redactString(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_CARD]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[REDACTED_PHONE]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, "bearer [REDACTED_TOKEN]")
    .replace(/\b(access_token|refresh_token|token)=([^&\s]+)/gi, (_match, key: string, rawValue: string) =>
      redactParameterValue(key, rawValue, "[REDACTED_TOKEN]"),
    )
    .replace(/\b(password|session|session_id|cookie|secret|otp|cvv)=([^&\s]+)/gi, (_match, key: string, rawValue: string) =>
      redactParameterValue(key, rawValue, "[REDACTED]"),
    );
}

function redactParameterValue(key: string, rawValue: string, replacement: string): string {
  const punctuation = rawValue.match(/[.,;:!?)]*$/)?.[0] || "";
  return `${key}=${replacement}${punctuation}`;
}

export function tryParseAndRedact(value: unknown): unknown {
  if (typeof value !== "string") return redactValue(value);

  try {
    return redactValue(JSON.parse(value));
  } catch {
    return redactString(value);
  }
}
