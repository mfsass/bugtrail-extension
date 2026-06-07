export type BugTrailStepType =
  | "page-open"
  | "route-change"
  | "click"
  | "input"
  | "select"
  | "submit"
  | "note"
  | "bug-marker";

export type BugTrailElement = {
  tag?: string;
  text?: string;
  role?: string;
  ariaLabel?: string;
  name?: string;
  testId?: string;
  selector?: string;
  component?: string;
  action?: string;
  field?: string;
  value?: string;
};

export type BugTrailStep = {
  id: string;
  index: number;
  timestamp: string;
  type: BugTrailStepType;
  url: string;
  route?: string;
  label?: string;
  element?: BugTrailElement;
  relatedNetworkEventIds: string[];
  relatedConsoleEventIds: string[];
};

export type NetworkEvent = {
  id: string;
  requestId?: string;
  timestamp: string;
  method: string;
  url: string;
  path: string;
  status?: number;
  durationMs?: number;
  type?: "fetch" | "xhr" | "webRequest";
  requestPayload?: unknown;
  responsePayload?: unknown;
  responseUnavailableReason?: string;
  redacted: boolean;
  relatedStepId?: string;
};

export type ConsoleEvent = {
  id: string;
  timestamp: string;
  level: "error" | "warn" | "log";
  message: string;
  stack?: string;
  url: string;
  relatedStepId?: string;
};

export type BugTrailSession = {
  id: string;
  startedAt: string;
  endedAt?: string;
  app?: string;
  environment?: string;
  startUrl: string;
  endUrl?: string;
  browser: string;
  viewport: string;
  steps: BugTrailStep[];
  networkEvents: NetworkEvent[];
  consoleEvents: ConsoleEvent[];
  actualResult?: string;
  expectedResult?: string;
  notes?: string;
};

export type BugTrailRuntimeState = {
  activeTabId?: number;
  session?: BugTrailSession;
};

export type SiteAccessStatus = {
  url: string;
  originMatch?: string;
  displayHost?: string;
  isBuiltIn: boolean;
  isGranted: boolean;
  canRequest: boolean;
};

export type CapturedStepMessage = {
  kind: "bugtrail:step";
  step: Omit<BugTrailStep, "id" | "index" | "relatedNetworkEventIds" | "relatedConsoleEventIds">;
};

export type CapturedConsoleMessage = {
  kind: "bugtrail:console";
  event: Omit<ConsoleEvent, "id" | "relatedStepId">;
};

export type CapturedNetworkMessage = {
  kind: "bugtrail:network";
  event: Omit<NetworkEvent, "id" | "redacted" | "relatedStepId">;
};

export type BackgroundMessage =
  | { kind: "bugtrail:start"; tabId: number; app?: string; environment?: string }
  | { kind: "bugtrail:stop"; actualResult?: string; expectedResult?: string; notes?: string }
  | { kind: "bugtrail:clear" }
  | { kind: "bugtrail:get-state" }
  | { kind: "bugtrail:get-site-access"; url: string }
  | { kind: "bugtrail:inject-content"; tabId: number }
  | { kind: "bugtrail:register-site"; origin: string }
  | { kind: "bugtrail:unregister-site"; origin: string }
  | { kind: "bugtrail:mark-bug" }
  | { kind: "bugtrail:capture-screenshot" }
  | CapturedStepMessage
  | CapturedConsoleMessage
  | CapturedNetworkMessage;
