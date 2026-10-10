import { redactString, redactValue } from "./redaction";
import type { BugHunterSession, BugHunterStep, ConsoleEvent, NetworkEvent } from "./types";

const MAX_PRIMARY_STEPS = 20;

export function buildBugHunterReport(session: BugHunterSession): string {
  const lines: string[] = ["# BugHunter Report", "", "## Summary", summaryFor(session), "", "## Environment"];

  lines.push(`- App: ${redactString(session.app || "")}`);
  lines.push(`- Environment: ${redactString(session.environment || "")}`);
  lines.push(`- Start URL: ${formatRouteOrUrl(session.startUrl)}`);
  lines.push(`- End URL: ${formatRouteOrUrl(session.endUrl || session.startUrl)}`);
  lines.push(`- Browser: ${redactString(session.browser)}`);
  lines.push(`- Viewport: ${redactString(session.viewport)}`);
  lines.push(`- Started: ${formatDate(session.startedAt)}`);
  lines.push("", "## Steps Reproduced", "");

  const visibleSteps = selectVisibleSteps(session);
  for (const step of visibleSteps) {
    appendStep(lines, step, session);
  }

  const omittedStepCount = session.steps.length - visibleSteps.length;
  if (omittedStepCount > 0) {
    const nextNumber = Math.max(...visibleSteps.map((step) => step.index)) + 1;
    lines.push(`${nextNumber}. Additional interactions grouped.`);
    lines.push(`   - ${omittedStepCount} lower-priority actions recorded as background evidence`);
    lines.push("");
  }

  appendNetworkSummary(lines, session.networkEvents);
  appendConsoleOutput(lines, session.consoleEvents);

  pushOptionalSection(lines, "Actual Result", session.actualResult);
  pushOptionalSection(lines, "Expected Result", session.expectedResult);
  pushOptionalSection(lines, "Notes", session.notes);
  lines.push("## End of BugHunter Report");

  return lines.join("\n").trimEnd() + "\n";
}

export function bugHunterReportFilename(session: BugHunterSession): string {
  const app = slugPart(session.app || "bughunter");
  const environment = slugPart(session.environment || "report");
  const timestamp = new Date(session.startedAt).toISOString().replace(/[:.]/g, "-");
  return `${app}-${environment}-${timestamp}.md`;
}

function appendStep(lines: string[], step: BugHunterStep, session: BugHunterSession): void {
  lines.push(`${step.index}. ${stepSentence(step)}`);

  if (step.element?.tag) lines.push(`   - Element: \`${redactString(step.element.tag)}\``);
  if (step.element?.selector) lines.push(`   - Selector: \`${redactString(step.element.selector)}\``);
  if (step.element?.component) lines.push(`   - Component: \`${redactString(step.element.component)}\``);
  if (step.element?.testId) lines.push(`   - Test ID: \`${redactString(step.element.testId)}\``);
  if (step.element?.ariaLabel) lines.push(`   - Accessible label: \`${redactString(step.element.ariaLabel)}\``);
  if (step.element?.name) lines.push(`   - Name: \`${redactString(step.element.name)}\``);
  if (step.element?.text) lines.push(`   - Text: \`${redactString(step.element.text)}\``);
  if (step.element?.action) lines.push(`   - Action: \`${redactString(step.element.action)}\``);
  if (step.element?.field) lines.push(`   - Field: \`${redactString(step.element.field)}\``);
  if (step.element?.value) lines.push(`   - Value: \`${redactString(step.element.value)}\``);
  if (step.route) lines.push(`   - Route: \`${redactString(step.route)}\``);

  const relatedNetwork = session.networkEvents.filter((event) => event.relatedStepId === step.id || step.relatedNetworkEventIds.includes(event.id));
  for (const event of prioritizeNetwork(relatedNetwork)) {
    lines.push(`   - API: \`${event.method} ${safePath(event.path)}\` -> \`${event.status ?? "pending"}\``);
    if (event.durationMs != null) lines.push(`   - Duration: \`${event.durationMs}ms\``);
    if (event.requestPayload !== undefined) appendJsonBlock(lines, "   Request payload:", redactValue(event.requestPayload), "   ");
    if (event.responsePayload !== undefined) appendJsonBlock(lines, "   Response summary:", redactValue(event.responsePayload), "   ");
    if (event.responsePayload === undefined && event.responseUnavailableReason) {
      lines.push(`   - Response summary: unavailable (${redactString(event.responseUnavailableReason)})`);
    }
  }

  const relatedConsole = session.consoleEvents.filter((event) => event.relatedStepId === step.id || step.relatedConsoleEventIds.includes(event.id));
  for (const event of relatedConsole) {
    lines.push(`   - Console ${event.level}: \`${redactString(event.message)}\``);
  }

  lines.push("");
}

function selectVisibleSteps(session: BugHunterSession): BugHunterStep[] {
  if (session.steps.length <= MAX_PRIMARY_STEPS) return session.steps;

  const importantIds = importantStepIds(session);
  const selected = new Map<string, BugHunterStep>();
  for (const step of session.steps.slice(0, MAX_PRIMARY_STEPS)) selected.set(step.id, step);

  for (const step of session.steps) {
    if (!importantIds.has(step.id)) continue;
    selected.set(step.id, step);
    while (selected.size > MAX_PRIMARY_STEPS) {
      const removable = [...selected.values()]
        .reverse()
        .find((candidate) => !importantIds.has(candidate.id) && candidate.type !== "page-open");
      if (!removable) break;
      selected.delete(removable.id);
    }
  }

  return [...selected.values()].sort((a, b) => a.index - b.index);
}

function importantStepIds(session: BugHunterSession): Set<string> {
  const important = new Set<string>();
  for (const step of session.steps) {
    if (step.type === "bug-marker" || step.relatedConsoleEventIds.length > 0) important.add(step.id);
  }
  for (const event of session.networkEvents) {
    if ((event.status ?? 0) >= 400 && event.relatedStepId) important.add(event.relatedStepId);
  }
  for (const event of session.consoleEvents) {
    if (event.relatedStepId) important.add(event.relatedStepId);
  }
  return important;
}

function appendNetworkSummary(lines: string[], events: NetworkEvent[]): void {
  lines.push("## Network Summary");
  if (events.length === 0) {
    lines.push("- No API calls captured", "");
    return;
  }

  for (const event of events) {
    const stepSuffix = event.relatedStepId ? ` after ${event.relatedStepId.replace("step-", "Step ")}` : "";
    lines.push(`- \`${event.method} ${safePath(event.path)}\` -> \`${event.status ?? "pending"}\`${stepSuffix}`);
    if (event.durationMs != null) lines.push(`  - Duration: \`${event.durationMs}ms\``);
    if (event.requestPayload !== undefined) lines.push("  - Request payload included");
    lines.push(`  - Response summary ${event.responsePayload !== undefined ? "included" : "unavailable"}`);
  }
  lines.push("");
}

function appendConsoleOutput(lines: string[], events: ConsoleEvent[]): void {
  lines.push("## Console Output");
  if (events.length === 0) {
    lines.push("- No console errors or warnings captured", "");
    return;
  }

  for (const event of events) {
    const step = event.relatedStepId?.replace("step-", "Step ");
    lines.push(`- ${capitalize(event.level)}${step ? ` after ${step}` : ""}: \`${redactString(event.message)}\``);
  }
  lines.push("");
}

function stepSentence(step: BugHunterStep): string {
  const label = redactString(step.label || step.element?.text || step.element?.ariaLabel || step.element?.name || step.element?.selector || "element");
  switch (step.type) {
    case "page-open":
      return `Opened \`${redactString(step.route || formatRouteOrUrl(step.url))}\`.`;
    case "route-change":
      return `Navigated to \`${redactString(step.route || formatRouteOrUrl(step.url))}\`.`;
    case "click":
      return `Clicked **${label}**.`;
    case "input":
      return `Changed **${label}** field.`;
    case "select":
      return `Selected **${label}**.`;
    case "submit":
      return `Submitted **${label}**.`;
    case "bug-marker":
      if (step.element) return `Marked front-end issue on **${frontEndIssueLabel(label)}**.`;
      return "Marked bug here.";
    case "note":
      return `${label}.`;
  }
}

function frontEndIssueLabel(label: string): string {
  return label.replace(/^Front-end issue:\s*/i, "") || label;
}

function prioritizeNetwork(events: NetworkEvent[]): NetworkEvent[] {
  return [...events].sort((a, b) => Number((b.status ?? 0) >= 400) - Number((a.status ?? 0) >= 400));
}

function appendJsonBlock(lines: string[], label: string, value: unknown, indent = ""): void {
  lines.push("");
  lines.push(label);
  lines.push(`${indent}\`\`\`json`);
  for (const line of JSON.stringify(value, null, 2).split("\n")) lines.push(`${indent}${line}`);
  lines.push(`${indent}\`\`\``);
  lines.push("");
}

function summaryFor(session: BugHunterSession): string {
  const failed = session.networkEvents.filter((event) => (event.status ?? 0) >= 400).length;
  const errors = session.consoleEvents.filter((event) => event.level === "error").length;
  if (failed || errors) return `${session.steps.length} steps captured with ${failed} failed API call(s) and ${errors} console error(s).`;
  return `${session.steps.length} steps captured.`;
}

function formatRouteOrUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return redactString(parsed.pathname + parsed.search + parsed.hash);
  } catch {
    return redactString(url);
  }
}

function safePath(path: string): string {
  return redactString(path);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function slugPart(value: string): string {
  const redacted = redactString(value).toLowerCase();
  const slug = redacted.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "bughunter";
}

function pushOptionalSection(lines: string[], title: string, value?: string): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  lines.push("", `## ${title}`, redactString(trimmed));
}
