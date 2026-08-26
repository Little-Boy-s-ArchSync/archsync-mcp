import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import * as core from "@archsync/core";
import * as guardian from "@archsync/guardian";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("vendor/provenance.json", root), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

assert.equal(manifest.schema_version, 1);
assert.equal(manifest.status, "provisional-exact-package-boundary");
assert.equal(manifest.authority.accepted_release, false);
assert.equal(manifest.authority.security_approved, false);
assert.equal(manifest.authority.provider_enabled, false);
for (const [name, dependency] of Object.entries(manifest.packages)) {
  const content = await readFile(new URL(`vendor/${dependency.file}`, root));
  assert.equal(createHash("sha256").update(content).digest("hex"), dependency.sha256, `${name} package hash`);
  assert.match(packageJson.dependencies[name], new RegExp(dependency.file.replaceAll(".", "\\."), "u"));
  assert.equal(packageJson.bundledDependencies.includes(name), true, `${name} must be bundled`);
}

for (const name of ["loadArchitecture", "buildGraph"]) assert.equal(typeof core[name], "function", `Core ${name}`);
for (const name of ["analyzeTypeScriptRepository", "checkRepositoryDiff"]) assert.equal(typeof guardian[name], "function", `Guardian ${name}`);

const corePackage = JSON.parse(await readFile(new URL("../package.json", import.meta.resolve("@archsync/core")), "utf8"));
const guardianPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.resolve("@archsync/guardian")), "utf8"));
const guardianProvenance = JSON.parse(await readFile(new URL("../dist/provenance.json", import.meta.resolve("@archsync/guardian")), "utf8"));
assert.equal(corePackage.version, manifest.packages["@archsync/core"].version);
assert.equal(guardianPackage.version, manifest.packages["@archsync/guardian"].version);
assert.equal(guardianProvenance.source_commit, manifest.packages["@archsync/guardian"].source_commit);
assert.equal(guardianProvenance.package_content_sha256, manifest.packages["@archsync/guardian"].package_content_sha256);

console.log(`PASS MCP PINNED DEPENDENCIES (Core ${corePackage.version}; Guardian ${guardianPackage.version}; provisional boundary)`);
