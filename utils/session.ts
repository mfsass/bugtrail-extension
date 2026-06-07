import { redactValue, tryParseAndRedact } from "./redaction";
import type { BugTrailSession, BugTrailStep, ConsoleEvent, NetworkEvent } from "./types";

const CORRELATION_WINDOW_MS = 3000;
const MAX_STEPS = 300;
const MAX_NETWORK_EVENTS = 200;
const MAX_CONSOLE_EVENTS = 100;
export const ACTIVE_SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

export function createSession(input: {
  tabId: number;
  url: string;
  title?: string;
  app?: string;
  environment?: string;
  browser?: string;
  viewport?: string;
}): BugTrailSession {
  const now = new Date().toISOString();
  return {
    id: `trail-${input.tabId}-${Date.now()}`,
    startedAt: now,
    app: input.app,
    environment: input.environment,
    startUrl: input.url,
    browser: input.browser || "Chrome/Brave",
    viewport: input.viewport || "unknown",
    steps: [
      {
        id: "step-1",
        index: 1,
        timestamp: now,
        type: "page-open",
        url: input.url,
        route: routeFromUrl(input.url),
        label: input.title,
        relatedNetworkEventIds: [],
        relatedConsoleEventIds: [],
      },
    ],
    networkEvents: [],
    consoleEvents: [],
  };
}

export function addStep(session: BugTrailSession, step: Omit<BugTrailStep, "id" | "index" | "relatedNetworkEventIds" | "relatedConsoleEventIds">): BugTrailSession {
  const index = nextStepIndex(session.steps);
  const nextStep: BugTrailStep = {
    ...step,
    id: `step-${index}`,
    index,
    route: step.route || routeFromUrl(step.url),
    relatedNetworkEventIds: [],
    relatedConsoleEventIds: [],
  };

  return {
    ...session,
    endUrl: step.url,
    steps: limitSteps([...session.steps, nextStep]),
  };
}

export function addNetworkEvent(session: BugTrailSession, event: Omit<NetworkEvent, "id" | "redacted" | "relatedStepId">): BugTrailSession {
  const relatedStep = findRelatedStep(session.steps, event.timestamp);
  const duplicate = findDuplicateNetworkEvent(session.networkEvents, event);
  const id = duplicate?.id || `net-${session.networkEvents.length + 1}`;
  const nextEvent: NetworkEvent = {
    ...duplicate,
    ...event,
    id,
    path: event.path || routeFromUrl(event.url),
    requestPayload: event.requestPayload === undefined ? duplicate?.requestPayload : tryParseAndRedact(event.requestPayload),
    responsePayload: event.responsePayload === undefined ? duplicate?.responsePayload : tryParseAndRedact(event.responsePayload),
    responseUnavailableReason: event.responsePayload === undefined ? event.responseUnavailableReason || duplicate?.responseUnavailableReason : undefined,
    redacted: true,
    relatedStepId: duplicate?.relatedStepId || relatedStep?.id,
  };

  if (duplicate) {
    const networkEvents = limitNetworkEvents(session.networkEvents.map((existing) => (existing.id === duplicate.id ? preferRicherNetworkEvent(existing, nextEvent) : existing)));
    return {
      ...session,
      networkEvents,
      steps: pruneStepEvidenceReferences(relatedStep ? attachNetwork(session.steps, relatedStep.id, id) : session.steps, networkEvents, session.consoleEvents),
    };
  }

  const networkEvents = limitNetworkEvents([...session.networkEvents, nextEvent]);
  return {
    ...session,
    networkEvents,
    steps: pruneStepEvidenceReferences(relatedStep ? attachNetwork(session.steps, relatedStep.id, id) : session.steps, networkEvents, session.consoleEvents),
  };
}

export function addConsoleEvent(session: BugTrailSession, event: Omit<ConsoleEvent, "id" | "relatedStepId">): BugTrailSession {
  const relatedStep = findRelatedStep(session.steps, event.timestamp);
  const id = `console-${session.consoleEvents.length + 1}`;
  const nextEvent: ConsoleEvent = {
    ...event,
    id,
    message: String(redactValue(event.message)),
    stack: event.stack ? String(redactValue(event.stack)) : undefined,
    relatedStepId: relatedStep?.id,
  };

  const consoleEvents = limitConsoleEvents([...session.consoleEvents, nextEvent]);
  return {
    ...session,
    consoleEvents,
    steps: pruneStepEvidenceReferences(relatedStep ? attachConsole(session.steps, relatedStep.id, id) : session.steps, session.networkEvents, consoleEvents),
  };
}

export function routeFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return url;
  }
}

export function expireStaleActiveSession(
  state: { activeTabId?: number; session?: BugTrailSession },
  now = Date.now(),
): { activeTabId?: number; session?: BugTrailSession } {
  if (!state.session || state.session.endedAt) return state;
  const startedAt = Date.parse(state.session.startedAt);
  if (!Number.isFinite(startedAt) || now - startedAt <= ACTIVE_SESSION_TIMEOUT_MS) return state;

  return {
    ...state,
    activeTabId: undefined,
    session: {
      ...state.session,
      endedAt: new Date(now).toISOString(),
      endUrl: state.session.endUrl || state.session.startUrl,
      notes: appendNote(state.session.notes, "BugTrail auto-stopped this trail after 8 hours of inactivity."),
    },
  };
}

function findRelatedStep(steps: BugTrailStep[], timestamp: string): BugTrailStep | undefined {
  const eventMs = Date.parse(timestamp);
  const candidates = [...steps].reverse().filter((step) => {
    const delta = eventMs - Date.parse(step.timestamp);
    return delta >= 0 && delta <= CORRELATION_WINDOW_MS;
  });
  return candidates.find(isUserActionStep) || candidates[0] || steps.at(-1);
}

function isUserActionStep(step: BugTrailStep): boolean {
  return step.type === "click" || step.type === "submit" || step.type === "input" || step.type === "select" || step.type === "bug-marker";
}

function attachNetwork(steps: BugTrailStep[], stepId: string, eventId: string): BugTrailStep[] {
  return steps.map((step) =>
    step.id === stepId ? { ...step, relatedNetworkEventIds: uniqueAppend(step.relatedNetworkEventIds, eventId) } : step,
  );
}

function attachConsole(steps: BugTrailStep[], stepId: string, eventId: string): BugTrailStep[] {
  return steps.map((step) =>
    step.id === stepId ? { ...step, relatedConsoleEventIds: uniqueAppend(step.relatedConsoleEventIds, eventId) } : step,
  );
}

function uniqueAppend(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function nextStepIndex(steps: BugTrailStep[]): number {
  return Math.max(0, ...steps.map((step) => step.index)) + 1;
}

function limitSteps(steps: BugTrailStep[]): BugTrailStep[] {
  if (steps.length <= MAX_STEPS) return steps;
  if (steps.length === 0) return steps;
  const first = steps.find((step) => step.type === "page-open") || steps[0];
  if (!first) return steps;
  const tail = steps.filter((step) => step.id !== first.id).slice(-(MAX_STEPS - 1));
  return [first, ...tail];
}

function limitNetworkEvents(events: NetworkEvent[]): NetworkEvent[] {
  return events.length > MAX_NETWORK_EVENTS ? events.slice(-MAX_NETWORK_EVENTS) : events;
}

function limitConsoleEvents(events: ConsoleEvent[]): ConsoleEvent[] {
  return events.length > MAX_CONSOLE_EVENTS ? events.slice(-MAX_CONSOLE_EVENTS) : events;
}

function pruneStepEvidenceReferences(steps: BugTrailStep[], networkEvents: NetworkEvent[], consoleEvents: ConsoleEvent[]): BugTrailStep[] {
  const networkIds = new Set(networkEvents.map((event) => event.id));
  const consoleIds = new Set(consoleEvents.map((event) => event.id));
  return steps.map((step) => ({
    ...step,
    relatedNetworkEventIds: step.relatedNetworkEventIds.filter((id) => networkIds.has(id)),
    relatedConsoleEventIds: step.relatedConsoleEventIds.filter((id) => consoleIds.has(id)),
  }));
}

function findDuplicateNetworkEvent(
  events: NetworkEvent[],
  incoming: Omit<NetworkEvent, "id" | "redacted" | "relatedStepId">,
): NetworkEvent | undefined {
  const incomingMs = Date.parse(incoming.timestamp);
  return events.find((event) => {
    const delta = Math.abs(Date.parse(event.timestamp) - incomingMs);
    return event.method === incoming.method && event.path === incoming.path && event.status === incoming.status && delta <= 1000;
  });
}

function preferRicherNetworkEvent(existing: NetworkEvent, incoming: NetworkEvent): NetworkEvent {
  const incomingHasBody = incoming.responsePayload !== undefined;
  const existingHasBody = existing.responsePayload !== undefined;
  if (incomingHasBody && !existingHasBody) return incoming;
  if (!incomingHasBody && existingHasBody) {
    return {
      ...existing,
      requestPayload: existing.requestPayload ?? incoming.requestPayload,
      durationMs: existing.durationMs ?? incoming.durationMs,
    };
  }
  if (existing.type === "webRequest" && incoming.type !== "webRequest") return incoming;
  return { ...existing, ...incoming };
}

function appendNote(existing: string | undefined, note: string): string {
  return existing ? `${existing}\n${note}` : note;
}
