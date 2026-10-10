import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";

const root = process.cwd();
const tempRoots: string[] = [];

function makeTempWorkspace() {
  const tempRoot = join(tmpdir(), `bughunter-docs-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  tempRoots.push(tempRoot);
  mkdirSync(tempRoot, { recursive: true });

  writeFileSync(join(tempRoot, "package.json"), readFileSync(join(root, "package.json"), "utf8"));
  writeFileSync(join(tempRoot, "README.md"), readFileSync(join(root, "README.md"), "utf8"));
  cpSync(join(root, "docs"), join(tempRoot, "docs"), { recursive: true });

  return tempRoot;
}

function runValidator(cwd: string) {
  return execFileSync("node", [join(root, "scripts", "validate-docs.mjs")], {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("docs validation", () => {
  test("passes for the checked-in handoff documentation", () => {
    expect(runValidator(makeTempWorkspace())).toContain("Documentation validation passed.");
  });

  test("fails when a referenced docs file does not exist", () => {
    const workspace = makeTempWorkspace();
    writeFileSync(join(workspace, "README.md"), "[Missing](docs/not-real.md)");

    expect(() => runValidator(workspace)).toThrow(/missing referenced docs file docs\/not-real\.md/);
  });

  test("fails when release notes drift from the package version", () => {
    const workspace = makeTempWorkspace();
    writeFileSync(join(workspace, "package.json"), JSON.stringify({ name: "bughunter-extension", version: "9.9.9" }));

    expect(() => runValidator(workspace)).toThrow(/missing docs\/release-notes-9\.9\.9\.md/);
  });
});
