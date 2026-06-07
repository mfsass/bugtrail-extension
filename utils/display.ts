import { redactString } from "./redaction";

export function displayUrlContext(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${redactString(parsed.pathname + parsed.search + parsed.hash)}`;
  } catch {
    return redactString(url);
  }
}

export function displayRoute(urlOrRoute: string): string {
  try {
    const parsed = new URL(urlOrRoute);
    return redactString(parsed.pathname + parsed.search + parsed.hash);
  } catch {
    return redactString(urlOrRoute);
  }
}
