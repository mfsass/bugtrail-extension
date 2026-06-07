import { describe, expect, it } from "vitest";
import { addNetworkEvent, createSession } from "../utils/session";

describe("network event dedupe", () => {
  it("prefers page-level fetch capture over matching webRequest fallback", () => {
    let session = createSession({
      tabId: 1,
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers/1",
      title: "Customers",
    });

    session = addNetworkEvent(session, {
      timestamp: "2026-06-01T08:33:01.000Z",
      method: "PATCH",
      url: "https://rewards-admin-stage.spurcorpgifting.com/api/customers/1",
      path: "/api/customers/1",
      status: 500,
      durationMs: 120,
      type: "webRequest",
      requestPayload: { email: "qa@example.com" },
      responseUnavailableReason: "webRequest cannot read response bodies",
    });

    session = addNetworkEvent(session, {
      timestamp: "2026-06-01T08:33:01.150Z",
      method: "PATCH",
      url: "https://rewards-admin-stage.spurcorpgifting.com/api/customers/1",
      path: "/api/customers/1",
      status: 500,
      durationMs: 118,
      type: "fetch",
      requestPayload: { email: "qa@example.com" },
      responsePayload: { success: false, code: "PROFILE_STATE_INVALID" },
    });

    expect(session.networkEvents).toHaveLength(1);
    expect(session.networkEvents[0]?.type).toBe("fetch");
    expect(session.networkEvents[0]?.responsePayload).toEqual({ success: false, code: "PROFILE_STATE_INVALID" });
  });

  it("keeps separate requests with different methods or paths", () => {
    let session = createSession({
      tabId: 1,
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers/1",
      title: "Customers",
    });

    session = addNetworkEvent(session, {
      timestamp: "2026-06-01T08:33:01.000Z",
      method: "GET",
      url: "https://rewards-admin-stage.spurcorpgifting.com/api/customers/1",
      path: "/api/customers/1",
      status: 200,
      type: "fetch",
    });
    session = addNetworkEvent(session, {
      timestamp: "2026-06-01T08:33:01.100Z",
      method: "PATCH",
      url: "https://rewards-admin-stage.spurcorpgifting.com/api/customers/1",
      path: "/api/customers/1",
      status: 500,
      type: "fetch",
    });

    expect(session.networkEvents).toHaveLength(2);
  });
});
