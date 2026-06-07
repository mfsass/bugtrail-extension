import { describe, expect, it } from "vitest";
import { bugTrailReportFilename, buildBugTrailReport } from "../utils/report";
import type { BugTrailSession, BugTrailStep } from "../utils/types";

describe("buildBugTrailReport", () => {
  it("builds one pasteable Markdown report with correlated failed network and console evidence", () => {
    const session: BugTrailSession = {
      id: "session-1",
      startedAt: "2026-06-01T08:32:00.000Z",
      endedAt: "2026-06-01T08:35:00.000Z",
      app: "Spur Admin",
      environment: "Stage",
      startUrl: "https://stage.example.test/customers/123/profile",
      endUrl: "https://stage.example.test/customers/123/edit",
      browser: "Chrome",
      viewport: "1440x900",
      steps: [
        {
          id: "step-1",
          index: 1,
          timestamp: "2026-06-01T08:32:00.000Z",
          type: "page-open",
          url: "https://stage.example.test/customers/123/profile",
          route: "/customers/123/profile",
          label: "Customer Profile",
          relatedNetworkEventIds: [],
          relatedConsoleEventIds: [],
        },
        {
          id: "step-2",
          index: 2,
          timestamp: "2026-06-01T08:33:00.000Z",
          type: "click",
          url: "https://stage.example.test/customers/123/edit",
          route: "/customers/123/edit",
          label: "Save",
          element: {
            tag: "button",
            testId: "save-customer-button",
            component: "CustomerForm.SaveButton",
          },
          relatedNetworkEventIds: ["net-1"],
          relatedConsoleEventIds: ["console-1"],
        },
      ],
      networkEvents: [
        {
          id: "net-1",
          timestamp: "2026-06-01T08:33:01.000Z",
          method: "PATCH",
          url: "https://stage.example.test/api/customers/123",
          path: "/api/customers/123",
          status: 500,
          durationMs: 842,
          type: "fetch",
          requestPayload: { email: "qa@example.com", marketingOptIn: true },
          responsePayload: { success: false, code: "PROFILE_STATE_INVALID" },
          redacted: true,
          relatedStepId: "step-2",
        },
      ],
      consoleEvents: [
        {
          id: "console-1",
          timestamp: "2026-06-01T08:33:02.000Z",
          level: "error",
          message: "Cannot read properties of undefined",
          url: "https://stage.example.test/customers/123/edit",
          relatedStepId: "step-2",
        },
      ],
      actualResult: "Profile did not save.",
      expectedResult: "Profile should save.",
      notes: "Bug appears after Save.",
    };

    const report = buildBugTrailReport(session);

    expect(report).toContain("# BugTrail Report");
    expect(report).toContain("- App: Spur Admin");
    expect(report).toContain("2. Clicked **Save**.");
    expect(report).toContain("- Test ID: `save-customer-button`");
    expect(report).toContain("- API: `PATCH /api/customers/123` -> `500`");
    expect(report).toContain("\"email\": \"[REDACTED_EMAIL]\"");
    expect(report).toContain("- Error after Step 2: `Cannot read properties of undefined`");
    expect(report).toContain("## Actual Result\nProfile did not save.");
    expect(report).toContain("## End of BugTrail Report");
  });

  it("redacts sensitive values in network paths and input steps", () => {
    const session: BugTrailSession = {
      id: "session-2",
      startedAt: "2026-06-01T08:32:00.000Z",
      app: "Spur Admin",
      environment: "Stage",
      startUrl: "https://rewards-admin-stage.spurcorpgifting.com/login?token=secret-token",
      browser: "Chrome",
      viewport: "1440x900",
      steps: [
        {
          id: "step-1",
          index: 1,
          timestamp: "2026-06-01T08:32:00.000Z",
          type: "input",
          url: "https://rewards-admin-stage.spurcorpgifting.com/login",
          route: "/login",
          label: "Email qa@example.com",
          element: {
            tag: "input",
            field: "email",
            value: "[REDACTED_EMAIL]",
          },
          relatedNetworkEventIds: ["net-1"],
          relatedConsoleEventIds: [],
        },
      ],
      networkEvents: [
        {
          id: "net-1",
          timestamp: "2026-06-01T08:32:01.000Z",
          method: "GET",
          url: "https://rewards-admin-stage.spurcorpgifting.com/api/users?email=qa@example.com&access_token=abc123&password=hunter2&session_id=secret-session",
          path: "/api/users?email=qa@example.com&access_token=abc123&password=hunter2&session_id=secret-session",
          status: 200,
          type: "fetch",
          redacted: true,
          relatedStepId: "step-1",
        },
      ],
      consoleEvents: [],
    };

    const report = buildBugTrailReport(session);

    expect(report).toContain("- Value: `[REDACTED_EMAIL]`");
    expect(report).toContain("Changed **Email [REDACTED_EMAIL]** field.");
    expect(report).toContain("`GET /api/users?email=[REDACTED_EMAIL]&access_token=[REDACTED_TOKEN]&password=[REDACTED]&session_id=[REDACTED]`");
    expect(report).not.toContain("qa@example.com");
    expect(report).not.toContain("abc123");
    expect(report).not.toContain("hunter2");
    expect(report).not.toContain("secret-session");
    expect(report).not.toContain("secret-token");
  });

  it("redacts free-text result and note fields", () => {
    const report = buildBugTrailReport({
      id: "session-free-text",
      startedAt: "2026-06-01T08:32:00.000Z",
      app: "Rewards Admin",
      environment: "Stage",
      startUrl: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      browser: "Chrome",
      viewport: "1440x900",
      steps: [],
      networkEvents: [],
      consoleEvents: [],
      actualResult: "Customer qa@example.com saw bearer abc123 in the failed response.",
      expectedResult: "Customer phone +27 82 123 4567 should not expose session_id=secret-session.",
      notes: "Card 4111111111111111 and password=hunter2 were pasted into notes.",
    });

    expect(report).toContain("Customer [REDACTED_EMAIL] saw bearer [REDACTED_TOKEN] in the failed response.");
    expect(report).toContain("Customer phone [REDACTED_PHONE] should not expose session_id=[REDACTED].");
    expect(report).toContain("Card [REDACTED_CARD] and password=[REDACTED] were pasted into notes.");
    expect(report).not.toContain("qa@example.com");
    expect(report).not.toContain("abc123");
    expect(report).not.toContain("secret-session");
    expect(report).not.toContain("hunter2");
    expect(report).not.toContain("4111111111111111");
  });

  it("omits empty actual expected and notes sections", () => {
    const report = buildBugTrailReport({
      id: "session-empty-fields",
      startedAt: "2026-06-01T08:32:00.000Z",
      app: "Rewards Admin",
      environment: "Production",
      startUrl: "https://rewards-admin.spurcorpgifting.com/reports/token_dashboard",
      browser: "Chrome",
      viewport: "1350x1018",
      steps: [],
      networkEvents: [],
      consoleEvents: [],
      actualResult: "",
      expectedResult: "   ",
      notes: "",
    });

    expect(report).not.toContain("## Actual Result");
    expect(report).not.toContain("## Expected Result");
    expect(report).not.toContain("## Notes");
    expect(report).toContain("## End of BugTrail Report");
  });

  it("builds a safe Markdown filename for downloaded reports", () => {
    const filename = bugTrailReportFilename({
      id: "session-4",
      startedAt: "2026-06-01T08:32:00.000Z",
      app: "Rewards Admin",
      environment: "Stage / QA",
      startUrl: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      browser: "Chrome",
      viewport: "1440x900",
      steps: [],
      networkEvents: [],
      consoleEvents: [],
    });

    expect(filename).toBe("rewards-admin-stage-qa-2026-06-01T08-32-00-000Z.md");
  });

  it("redacts metadata, element identifiers, console text, and unavailable reasons", () => {
    const report = buildBugTrailReport({
      id: "session-5",
      startedAt: "2026-06-01T08:32:00.000Z",
      app: "Rewards qa@example.com",
      environment: "Stage token=abc123",
      startUrl: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      browser: "Chrome bearer abc123",
      viewport: "1440x900",
      steps: [
        {
          id: "step-1",
          index: 1,
          timestamp: "2026-06-01T08:32:00.000Z",
          type: "click",
          url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
          route: "/customers?session_id=abc123",
          label: "Save qa@example.com",
          element: {
            tag: "button",
            component: "Customer qa@example.com",
            testId: "save-token=abc123",
            action: "submit password=hunter2",
            field: "email",
          },
          relatedNetworkEventIds: ["net-1"],
          relatedConsoleEventIds: ["console-1"],
        },
      ],
      networkEvents: [
        {
          id: "net-1",
          timestamp: "2026-06-01T08:32:01.000Z",
          method: "GET",
          url: "https://rewards-admin-stage.spurcorpgifting.com/api/customers",
          path: "/api/customers",
          status: 0,
          type: "webRequest",
          redacted: true,
          responseUnavailableReason: "failed with token=abc123",
          relatedStepId: "step-1",
        },
      ],
      consoleEvents: [
        {
          id: "console-1",
          timestamp: "2026-06-01T08:32:01.000Z",
          level: "error",
          message: "qa@example.com failed with bearer abc123",
          url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
          relatedStepId: "step-1",
        },
      ],
    });

    expect(report).toContain("- App: Rewards [REDACTED_EMAIL]");
    expect(report).toContain("- Environment: Stage token=[REDACTED_TOKEN]");
    expect(report).toContain("Clicked **Save [REDACTED_EMAIL]**.");
    expect(report).toContain("- Component: `Customer [REDACTED_EMAIL]`");
    expect(report).toContain("- Test ID: `save-token=[REDACTED_TOKEN]`");
    expect(report).toContain("- Action: `submit password=[REDACTED]`");
    expect(report).toContain("- Response summary: unavailable (failed with token=[REDACTED_TOKEN])");
    expect(report).toContain("Console error: `[REDACTED_EMAIL] failed with bearer [REDACTED_TOKEN]`");
    expect(report).not.toContain("qa@example.com");
    expect(report).not.toContain("abc123");
    expect(report).not.toContain("hunter2");
  });

  it("keeps failed API steps visible when low-value steps exceed the primary step limit", () => {
    const steps: BugTrailStep[] = Array.from({ length: 22 }, (_, offset) => ({
      id: `step-${offset + 1}`,
      index: offset + 1,
      timestamp: `2026-06-01T08:32:${String(offset).padStart(2, "0")}.000Z`,
      type: "input" as const,
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      route: "/customers",
      label: `Filter ${offset + 1}`,
      relatedNetworkEventIds: [] as string[],
      relatedConsoleEventIds: [] as string[],
    }));
    steps.push({
      id: "step-23",
      index: 23,
      timestamp: "2026-06-01T08:33:00.000Z",
      type: "click",
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      route: "/customers",
      label: "Save",
      relatedNetworkEventIds: ["net-1"],
      relatedConsoleEventIds: [],
    });

    const report = buildBugTrailReport({
      id: "session-3",
      startedAt: "2026-06-01T08:32:00.000Z",
      app: "Spur Admin",
      environment: "Stage",
      startUrl: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      browser: "Chrome",
      viewport: "1440x900",
      steps,
      networkEvents: [
        {
          id: "net-1",
          timestamp: "2026-06-01T08:33:01.000Z",
          method: "PATCH",
          url: "https://rewards-admin-stage.spurcorpgifting.com/api/customers",
          path: "/api/customers",
          status: 500,
          type: "fetch",
          redacted: true,
          relatedStepId: "step-23",
        },
      ],
      consoleEvents: [],
    });

    expect(report).toContain("23. Clicked **Save**.");
    expect(report).toContain("- API: `PATCH /api/customers` -> `500`");
    expect(report).toContain("Additional interactions grouped.");
  });
});
