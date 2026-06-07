import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const outputDir = join(root, ".output");
const zipName = `${packageJson.name}-${packageJson.version}-chrome.zip`;
const zipPath = join(outputDir, zipName);
const sidecarPath = join(outputDir, `${zipName}.sha256`);
const manifestPath = join(outputDir, "release-manifest.json");

function fail(message) {
  console.error(`Release metadata validation failed: ${message}`);
  process.exit(1);
}

for (const path of [zipPath, sidecarPath, manifestPath]) {
  if (!existsSync(path)) fail(`missing ${path}`);
}

const zip = await readFile(zipPath);
const actualSha256 = createHash("sha256").update(zip).digest("hex");
const sidecar = (await readFile(sidecarPath, "utf8")).trim();
const [sidecarSha256, sidecarArtifact] = sidecar.split(/\s+/);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (sidecarSha256 !== actualSha256) fail("sidecar sha256 does not match zip");
if (sidecarArtifact !== zipName) fail("sidecar artifact name does not match zip");
if (manifest.name !== packageJson.name) fail("release manifest package name mismatch");
if (manifest.version !== packageJson.version) fail("release manifest version mismatch");
if (manifest.artifact !== zipName) fail("release manifest artifact mismatch");
if (manifest.sizeBytes !== zip.byteLength) fail("release manifest size mismatch");
if (manifest.sha256 !== actualSha256) fail("release manifest sha256 mismatch");
if (!Number.isFinite(Date.parse(manifest.createdAt))) fail("release manifest createdAt is invalid");

console.log("Release metadata validation passed.");
