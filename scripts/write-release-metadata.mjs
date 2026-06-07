import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const zipName = `${packageJson.name}-${packageJson.version}-chrome.zip`;
const outputDir = join(root, ".output");
const zipPath = join(outputDir, zipName);

if (!existsSync(zipPath)) {
  console.error(`Release metadata failed: missing ${zipPath}; run npm run zip first`);
  process.exit(1);
}

const zip = await readFile(zipPath);
const sha256 = createHash("sha256").update(zip).digest("hex");
const createdAt = new Date().toISOString();

await writeFile(join(outputDir, `${zipName}.sha256`), `${sha256}  ${zipName}\n`, "utf8");
await writeFile(
  join(outputDir, "release-manifest.json"),
  `${JSON.stringify(
    {
      name: packageJson.name,
      version: packageJson.version,
      artifact: basename(zipPath),
      sizeBytes: zip.byteLength,
      sha256,
      createdAt,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Release metadata written for ${zipName}`);
