import { describe, expect, it } from "vitest";
import { displayRoute, displayUrlContext } from "../utils/display";

describe("display helpers", () => {
  it("formats route context without leaking sensitive query values", () => {
    expect(displayUrlContext("https://example.test/customers?email=qa@example.com&token=abc123")).toBe(
      "example.test/customers?email=[REDACTED_EMAIL]&token=[REDACTED_TOKEN]",
    );
  });

  it("returns a safe route for invalid or partial URLs", () => {
    expect(displayRoute("/customers?access_token=abc123")).toBe("/customers?access_token=[REDACTED_TOKEN]");
    expect(displayRoute("not a url")).toBe("not a url");
  });
});
