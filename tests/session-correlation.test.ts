import { describe, expect, it } from "vitest";
import { addNetworkEvent, addStep, createSession } from "../utils/session";

describe("session event correlation", () => {
  it("attaches network evidence to the latest user action instead of a route-change caused by that action", () => {
    let session = createSession({
      tabId: 1,
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers/1",
      title: "Customers",
    });

    session = addStep(session, {
      timestamp: "2026-06-01T08:33:00.000Z",
      type: "click",
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers/1",
      route: "/customers/1",
      label: "Save",
    });
    session = addStep(session, {
      timestamp: "2026-06-01T08:33:00.250Z",
      type: "route-change",
      url: "https://rewards-admin-stage.spurcorpgifting.com/customers/1/edit",
      route: "/customers/1/edit",
      label: "Edit Customer",
    });
    session = addNetworkEvent(session, {
      timestamp: "2026-06-01T08:33:00.600Z",
      method: "PATCH",
      url: "https://rewards-admin-stage.spurcorpgifting.com/api/customers/1",
      path: "/api/customers/1",
      status: 500,
      type: "fetch",
    });

    expect(session.networkEvents[0]?.relatedStepId).toBe("step-2");
    expect(session.steps[1]?.relatedNetworkEventIds).toEqual(["net-1"]);
    expect(session.steps[2]?.relatedNetworkEventIds).toEqual([]);
  });
});
