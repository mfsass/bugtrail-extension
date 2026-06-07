import { describe, expect, it } from "vitest";
import { redactString, redactValue } from "../utils/redaction";

describe("redactValue", () => {
  it("redacts sensitive object fields recursively", () => {
    const result = redactValue({
      email: "qa@example.com",
      phone: "+27821234567",
      access_token: "abc123",
      profile: {
        password: "hunter2",
        marketingOptIn: true,
      },
      items: [{ card: "4111111111111111", quantity: 2 }],
    });

    expect(result).toEqual({
      email: "[REDACTED_EMAIL]",
      phone: "[REDACTED_PHONE]",
      access_token: "[REDACTED_TOKEN]",
      profile: {
        password: "[REDACTED]",
        marketingOptIn: true,
      },
      items: [{ card: "[REDACTED_CARD]", quantity: 2 }],
    });
  });

  it("redacts email, phone, and bearer tokens embedded in strings", () => {
    const result = redactValue(
      "Contact qa@example.com or +27 82 123 4567 with bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    );

    expect(result).toBe("Contact [REDACTED_EMAIL] or [REDACTED_PHONE] with bearer [REDACTED_TOKEN]");
  });

  it("redacts card-like values and sensitive query parameters embedded in strings", () => {
    const result = redactString(
      "/checkout?card=4111111111111111&password=hunter2&session_id=abc123&otp=123456",
    );

    expect(result).toBe("/checkout?card=[REDACTED_CARD]&password=[REDACTED]&session_id=[REDACTED]&otp=[REDACTED]");
  });

  it("preserves sentence punctuation after redacted inline sensitive parameters", () => {
    const result = redactString("Expected no session_id=secret-session. Also no token=abc123, password=hunter2!");

    expect(result).toBe("Expected no session_id=[REDACTED]. Also no token=[REDACTED_TOKEN], password=[REDACTED]!");
  });
});
