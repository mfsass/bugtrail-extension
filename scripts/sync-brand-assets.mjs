import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const targetDir = join(root, "public", "assets");
mkdirSync(targetDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  copyFileSync(join(root, "assets", `icon-${size}.png`), join(targetDir, `icon-${size}.png`));
}

copyFileSync(join(root, "assets", "bugtrail-logo.svg"), join(targetDir, "bugtrail-logo.svg"));
console.log("Brand assets synced to public/assets");
