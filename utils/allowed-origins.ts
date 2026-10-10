export const ALLOWED_HOST_MATCHES = [
  "https://rewards-admin.spurcorpgifting.com/*",
  "https://rewards-admin-stage.spurcorpgifting.com/*",
  "https://rewards-admin-dev.spurcorpgifting.com/*",
  "http://localhost/*",
  "http://127.0.0.1/*",
] as const;

export const OPTIONAL_HOST_MATCHES = ["http://*/*", "https://*/*"] as const;

const ALLOWED_HOSTS = new Set([
  "rewards-admin.spurcorpgifting.com",
  "rewards-admin-stage.spurcorpgifting.com",
  "rewards-admin-dev.spurcorpgifting.com",
  "localhost",
  "127.0.0.1",
]);

export function isBuiltInBugHunterUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function matchForOrigin(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return undefined;
  }
}

export function displayHostFromMatch(match: string): string {
  try {
    const parsed = new URL(match.replace("*", ""));
    return parsed.host;
  } catch {
    return match.replace(/\/\*$/, "");
  }
}

export function inferBugHunterContext(url: string): { app?: string; environment?: string } {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "rewards-admin.spurcorpgifting.com") return { app: "Rewards Admin", environment: "Production" };
    if (host === "rewards-admin-stage.spurcorpgifting.com") return { app: "Rewards Admin", environment: "Stage" };
    if (host === "rewards-admin-dev.spurcorpgifting.com") return { app: "Rewards Admin", environment: "Dev" };
    if (host === "localhost" || host === "127.0.0.1") return { app: "Local App", environment: "Local" };

    const app = host
      .replace(/^www\./, "")
      .split(".")[0]
      ?.replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    return { app: app || undefined, environment: inferEnvironmentFromHost(host) };
  } catch {
    return {};
  }
}

function inferEnvironmentFromHost(host: string): string | undefined {
  if (/(^|[-.])prod(uction)?([-.]|$)/i.test(host)) return "Production";
  if (/(^|[-.])stag(e|ing)([-.]|$)/i.test(host)) return "Stage";
  if (/(^|[-.])dev(elopment)?([-.]|$)/i.test(host)) return "Dev";
  if (/(^|[-.])qa([-.]|$)/i.test(host)) return "QA";
  if (/(^|[-.])test([-.]|$)/i.test(host)) return "Test";
  if (/(^|[-.])uat([-.]|$)/i.test(host)) return "UAT";
  return undefined;
}
