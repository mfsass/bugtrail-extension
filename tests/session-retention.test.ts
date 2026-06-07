import { describe, expect, it } from "vitest";
import { ACTIVE_SESSION_TIMEOUT_MS, addConsoleEvent, addNetworkEvent, addStep, createSession, expireStaleActiveSession } from "../utils/session";

describe("session retention limits", () => {
  it("keeps the opening step and newest interactions while preserving monotonic step numbers", () => {
    let session = createSession({
      tabId: 1,
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      title: "Customers",
    });

    for (let index = 0; index < 320; index += 1) {
      session = addStep(session, {
        timestamp: `2026-06-01T08:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
        type: "click",
        url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
        route: "/customers",
        label: `Action ${index}`,
      });
    }

    expect(session.steps).toHaveLength(300);
    expect(session.steps[0]?.type).toBe("page-open");
    expect(session.steps.at(-1)?.index).toBe(321);

    session = addStep(session, {
      timestamp: "2026-06-01T08:10:00.000Z",
      type: "click",
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      route: "/customers",
      label: "Final action",
    });

    expect(session.steps).toHaveLength(300);
    expect(session.steps.at(-1)?.index).toBe(322);
  });

  it("limits network evidence and removes rolled-off references from steps", () => {
    let session = createSession({
      tabId: 1,
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      title: "Customers",
    });

    for (let index = 0; index < 205; index += 1) {
      session = addNetworkEvent(session, {
        timestamp: `2026-06-01T08:33:${String(index % 60).padStart(2, "0")}.000Z`,
        method: "GET",
        url: `https://rewards-admin-stage.spurcorpgifting.com/api/customers/${index}`,
        path: `/api/customers/${index}`,
        status: 200,
        type: "fetch",
      });
    }

    expect(session.networkEvents).toHaveLength(200);
    expect(session.networkEvents[0]?.id).toBe("net-6");
    expect(session.steps[0]?.relatedNetworkEventIds).not.toContain("net-1");
  });

  it("limits console evidence and removes rolled-off references from steps", () => {
    let session = createSession({
      tabId: 1,
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      title: "Customers",
    });

    for (let index = 0; index < 105; index += 1) {
      session = addConsoleEvent(session, {
        timestamp: `2026-06-01T08:33:${String(index % 60).padStart(2, "0")}.000Z`,
        level: "error",
        message: `Error ${index}`,
        url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      });
    }

    expect(session.consoleEvents).toHaveLength(100);
    expect(session.consoleEvents[0]?.id).toBe("console-6");
    expect(session.steps[0]?.relatedConsoleEventIds).not.toContain("console-1");
  });
});

describe("stale active session recovery", () => {
  it("keeps active sessions open within the timeout window", () => {
    const session = createSession({
      tabId: 1,
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
      title: "Customers",
    });
    const startedAt = Date.parse(session.startedAt);

    const state = expireStaleActiveSession({ activeTabId: 1, session }, startedAt + ACTIVE_SESSION_TIMEOUT_MS - 1000);

    expect(state.activeTabId).toBe(1);
    expect(state.session?.endedAt).toBeUndefined();
  });

  it("auto-stops active sessions older than the timeout while preserving the report", () => {
    const session = {
      ...createSession({
        tabId: 1,
        url: "https://rewards-admin-stage.spurcorpgifting.com/customers",
        title: "Customers",
      }),
      startedAt: "2026-06-01T00:00:00.000Z",
      notes: "Initial note",
    };

    const state = expireStaleActiveSession({ activeTabId: 1, session }, Date.parse("2026-06-01T09:00:00.000Z"));

    expect(state.activeTabId).toBeUndefined();
    expect(state.session?.endedAt).toBe("2026-06-01T09:00:00.000Z");
    expect(state.session?.endUrl).toBe(session.startUrl);
    expect(state.session?.notes).toContain("Initial note");
    expect(state.session?.notes).toContain("auto-stopped");
    expect(state.session?.steps).toHaveLength(1);
  });
});
