import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, normalize, relative, sep } from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`Documentation validation failed: ${message}`);
  process.exit(1);
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function assertFile(path, label = path) {
  if (!existsSync(path)) fail(`missing ${label}`);
}

const packageJsonPath = join(root, "package.json");
assertFile(packageJsonPath, "package.json");

const packageJson = JSON.parse(readText(packageJsonPath));
const version = packageJson.version;
const releaseNotesFile = `release-notes-${version}.md`;
const expectedZip = `${packageJson.name}-${version}-chrome.zip`;

const requiredDocs = [
  "README.md",
  "docs/production-readiness.md",
  "docs/signoff-review.md",
  "docs/qa-install-guide.md",
  "docs/live-pilot-checklist.md",
  "docs/permissions-and-privacy.md",
  "docs/store/listing.md",
  "docs/store/privacy-policy.md",
  "docs/store/launch-checklist.md",
  `docs/${releaseNotesFile}`,
];

for (const doc of requiredDocs) {
  assertFile(join(root, doc), doc);
}

const markdownFiles = [
  join(root, "README.md"),
  ...readdirSync(join(root, "docs"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(root, "docs", file)),
  ...(existsSync(join(root, "docs", "store"))
    ? readdirSync(join(root, "docs", "store"))
        .filter((file) => file.endsWith(".md"))
        .map((file) => join(root, "docs", "store", file))
    : []),
];

for (const path of markdownFiles) {
  const content = readText(path);
  const linkPattern = /(?:\[[^\]]*\]\(|\b)(docs\/[^)\s#]+\.md)/g;
  for (const match of content.matchAll(linkPattern)) {
    const referenced = match[1];
    if (!referenced) continue;
    const normalized = normalize(referenced);
    if (normalized.startsWith(".." + sep) || normalized.includes(sep + ".." + sep)) {
      fail(`invalid docs reference ${referenced}`);
    }
    if (!existsSync(join(root, normalized))) {
      fail(`missing referenced docs file ${referenced}`);
    }
  }
}

const allDocs = markdownFiles.map((path) => ({
  path,
  name: basename(path),
  text: readText(path),
}));
const allDocsText = allDocs.map((doc) => doc.text).join("\n");
const releaseNotes = allDocs.find((doc) => doc.name === releaseNotesFile);

if (!releaseNotes?.text.includes(version)) fail(`docs/${releaseNotesFile} must mention version ${version}`);
if (!allDocsText.includes(expectedZip)) fail(`documentation must reference ${expectedZip}`);
if (!allDocsText.includes(`${expectedZip}.sha256`)) fail(`documentation must reference ${expectedZip}.sha256`);
if (!allDocsText.includes("release-manifest.json")) fail("documentation must reference release-manifest.json");
if (!allDocsText.includes("npm run verify:release")) fail("documentation must reference npm run verify:release");
if (!allDocsText.includes("docs/live-pilot-checklist.md")) fail("documentation must reference docs/live-pilot-checklist.md");
if (!allDocsText.includes("docs/permissions-and-privacy.md")) fail("documentation must reference docs/permissions-and-privacy.md");

const wxtConfigPath = join(root, "wxt.config.ts");
if (existsSync(wxtConfigPath)) {
  const manifestDescription = readText(wxtConfigPath).match(/description:\s*"([^"]+)"/)?.[1];
  if (!manifestDescription) fail("could not read the manifest description from wxt.config.ts");
  const listing = readText(join(root, "docs/store/listing.md"));
  if (!listing.includes(manifestDescription)) {
    fail(`docs/store/listing.md summary must match the manifest description: "${manifestDescription}"`);
  }
}

const releaseNotesPathFromRoot = relative(root, releaseNotes.path).replaceAll("\\", "/");
if (releaseNotesPathFromRoot !== `docs/${releaseNotesFile}`) fail(`missing docs/${releaseNotesFile}`);

console.log("Documentation validation passed.");
