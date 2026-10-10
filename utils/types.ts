export type BugHunterStepType =
  | "page-open"
  | "route-change"
  | "click"
  | "input"
  | "select"
  | "submit"
  | "note"
  | "bug-marker";

export type BugHunterElement = {
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

export type BugHunterStep = {
  id: string;
  index: number;
  timestamp: string;
  type: BugHunterStepType;
  url: string;
  route?: string;
  label?: string;
  element?: BugHunterElement;
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

export type BugHunterSession = {
  id: string;
  startedAt: string;
  endedAt?: string;
  app?: string;
  environment?: string;
  startUrl: string;
  endUrl?: string;
  browser: string;
  viewport: string;
  steps: BugHunterStep[];
  networkEvents: NetworkEvent[];
  consoleEvents: ConsoleEvent[];
  actualResult?: string;
  expectedResult?: string;
  notes?: string;
};

export type BugHunterRuntimeState = {
  activeTabId?: number;
  session?: BugHunterSession;
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
  kind: "bughunter:step";
  step: Omit<BugHunterStep, "id" | "index" | "relatedNetworkEventIds" | "relatedConsoleEventIds">;
};

export type CapturedConsoleMessage = {
  kind: "bughunter:console";
  event: Omit<ConsoleEvent, "id" | "relatedStepId">;
};

export type CapturedNetworkMessage = {
  kind: "bughunter:network";
  event: Omit<NetworkEvent, "id" | "redacted" | "relatedStepId">;
};

export type BackgroundMessage =
  | { kind: "bughunter:start"; tabId: number; app?: string; environment?: string }
  | { kind: "bughunter:stop"; actualResult?: string; expectedResult?: string; notes?: string }
  | { kind: "bughunter:clear" }
  | { kind: "bughunter:get-state" }
  | { kind: "bughunter:inject-content"; tabId: number }
  | { kind: "bughunter:register-site"; origin: string }
  | { kind: "bughunter:unregister-site"; origin: string }
  | { kind: "bughunter:mark-bug" }
  | { kind: "bughunter:set-inspect-mode"; enabled: boolean }
  | { kind: "bughunter:capture-screenshot" }
  | CapturedStepMessage
  | CapturedConsoleMessage
  | CapturedNetworkMessage;
