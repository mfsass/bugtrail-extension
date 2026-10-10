import { describe, expect, it } from "vitest";
import {
  ALLOWED_HOST_MATCHES,
  OPTIONAL_HOST_MATCHES,
  displayHostFromMatch,
  inferBugHunterContext,
  isBuiltInBugHunterUrl,
  matchForOrigin,
} from "../utils/allowed-origins";

describe("allowed BugHunter origins", () => {
  it("includes Spur rewards admin environments and localhost", () => {
    expect(ALLOWED_HOST_MATCHES).toEqual([
      "https://rewards-admin.spurcorpgifting.com/*",
      "https://rewards-admin-stage.spurcorpgifting.com/*",
      "https://rewards-admin-dev.spurcorpgifting.com/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
    ]);
  });

  it("allows the configured app origins", () => {
    expect(isBuiltInBugHunterUrl("https://rewards-admin.spurcorpgifting.com/customers")).toBe(true);
    expect(isBuiltInBugHunterUrl("https://rewards-admin-stage.spurcorpgifting.com/")).toBe(true);
    expect(isBuiltInBugHunterUrl("https://rewards-admin-dev.spurcorpgifting.com/orders/123")).toBe(true);
    expect(isBuiltInBugHunterUrl("http://localhost:3000/debug")).toBe(true);
    expect(isBuiltInBugHunterUrl("http://127.0.0.1:5173/")).toBe(true);
  });

  it("rejects unrelated sites and unsupported schemes", () => {
    expect(isBuiltInBugHunterUrl("https://example.com/")).toBe(false);
    expect(isBuiltInBugHunterUrl("https://teams.microsoft.com/")).toBe(false);
    expect(isBuiltInBugHunterUrl("chrome://extensions")).toBe(false);
  });

  it("derives a Chrome match pattern for an origin", () => {
    expect(matchForOrigin("https://rewards-admin-stage.spurcorpgifting.com/customers/1")).toBe(
      "https://rewards-admin-stage.spurcorpgifting.com/*",
    );
    expect(matchForOrigin("http://localhost:3000/foo")).toBe("http://localhost:3000/*");
  });

  it("declares broad optional host access for user-added sites", () => {
    expect(OPTIONAL_HOST_MATCHES).toEqual(["http://*/*", "https://*/*"]);
  });

  it("formats host matches for the allowed-sites UI", () => {
    expect(displayHostFromMatch("https://example.company.com/*")).toBe("example.company.com");
    expect(displayHostFromMatch("http://localhost:3000/*")).toBe("localhost:3000");
  });

  it("infers app and environment context from known and user-added URLs", () => {
    expect(inferBugHunterContext("https://rewards-admin.spurcorpgifting.com/customers")).toEqual({
      app: "Rewards Admin",
      environment: "Production",
    });
    expect(inferBugHunterContext("https://rewards-admin-stage.spurcorpgifting.com/customers")).toEqual({
      app: "Rewards Admin",
      environment: "Stage",
    });
    expect(inferBugHunterContext("http://localhost:5173/orders")).toEqual({
      app: "Local App",
      environment: "Local",
    });
    expect(inferBugHunterContext("https://customer-portal-uat.example.com/orders")).toEqual({
      app: "Customer Portal Uat",
      environment: "UAT",
    });
  });
});
