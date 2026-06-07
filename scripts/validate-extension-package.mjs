import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outputDir = join(root, ".output", "chrome-mv3");
const manifestPath = join(outputDir, "manifest.json");

function fail(message) {
  console.error(`Package validation failed: ${message}`);
  process.exit(1);
}

if (!existsSync(manifestPath)) fail("missing .output/chrome-mv3/manifest.json; run npm run build first");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const requiredBuiltInHosts = [
  "https://rewards-admin.spurcorpgifting.com/*",
  "https://rewards-admin-stage.spurcorpgifting.com/*",
  "https://rewards-admin-dev.spurcorpgifting.com/*",
  "http://localhost/*",
  "http://127.0.0.1/*",
];
const requiredOptionalHosts = ["http://*/*", "https://*/*"];
const requiredPermissions = ["storage", "sidePanel", "scripting", "activeTab", "tabs", "webRequest"];

if (manifest.manifest_version !== 3) fail("manifest version must be 3");
if (manifest.name !== "BugTrail") fail("manifest name must be BugTrail");
if (manifest.description !== "Turn QA clicks into developer-ready bug trails.") fail("unexpected manifest description");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version || "")) fail("manifest version must be semver-like");

for (const permission of requiredPermissions) {
  if (!manifest.permissions?.includes(permission)) fail(`missing permission ${permission}`);
}
const unexpectedPermissions = (manifest.permissions || []).filter((permission) => !requiredPermissions.includes(permission));
if (unexpectedPermissions.length > 0) fail(`unexpected permissions ${unexpectedPermissions.join(", ")}`);

for (const host of requiredBuiltInHosts) {
  if (!manifest.host_permissions?.includes(host)) fail(`missing built-in host ${host}`);
}
const unexpectedBuiltInHosts = (manifest.host_permissions || []).filter((host) => !requiredBuiltInHosts.includes(host));
if (unexpectedBuiltInHosts.length > 0) fail(`unexpected built-in host permissions ${unexpectedBuiltInHosts.join(", ")}`);

for (const host of requiredOptionalHosts) {
  if (!manifest.optional_host_permissions?.includes(host)) fail(`missing optional host ${host}`);
}
const unexpectedOptionalHosts = (manifest.optional_host_permissions || []).filter((host) => !requiredOptionalHosts.includes(host));
if (unexpectedOptionalHosts.length > 0) fail(`unexpected optional host permissions ${unexpectedOptionalHosts.join(", ")}`);

if (manifest.side_panel?.default_path !== "sidepanel.html") fail("side panel default path is not sidepanel.html");
if (manifest.background?.service_worker !== "background.js") fail("background service worker is not background.js");

const contentMatches = manifest.content_scripts?.flatMap((script) => script.matches || []) || [];
for (const broad of requiredOptionalHosts) {
  if (contentMatches.includes(broad)) fail(`static content script must not match ${broad}`);
}
for (const host of requiredBuiltInHosts) {
  if (!contentMatches.includes(host)) fail(`static content script missing built-in host ${host}`);
}

const webResources = manifest.web_accessible_resources || [];
const bridgeResource = webResources.find((resource) => resource.resources?.includes("page-bridge.js"));
if (!bridgeResource) fail("page bridge is not web accessible");
for (const host of [...requiredBuiltInHosts, ...requiredOptionalHosts]) {
  if (!bridgeResource.matches?.includes(host)) fail(`page bridge missing web accessible match ${host}`);
}

const iconPaths = Object.values(manifest.icons || {});
const actionIconPaths = Object.values(manifest.action?.default_icon || {});
for (const icon of [...iconPaths, ...actionIconPaths]) {
  if (!existsSync(join(outputDir, icon))) fail(`manifest references missing icon ${icon}`);
}

for (const requiredFile of ["sidepanel.html", "background.js", "page-bridge.js", "content-scripts/content.js"]) {
  if (!existsSync(join(outputDir, requiredFile))) fail(`missing built output ${requiredFile}`);
}

console.log("Extension package validation passed.");
