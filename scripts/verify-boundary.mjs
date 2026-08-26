import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const policy = JSON.parse(await readFile(join(root, "boundary-policy.json"), "utf8"));
const readme = await readFile(join(root, "README.md"), "utf8");
const boundary = await readFile(join(root, "docs", "BOUNDARY.md"), "utf8");

assert.equal(policy.schema_version, 1);
assert.equal(policy.status, "implementation-blocked-until-versioned-phase-4-contracts");
assert.deepEqual(Object.keys(policy.delegates).sort(), [
  "architecture-validation",
  "drift-and-policy-decisions",
  "graph-and-conformance",
  "repair-verification",
]);
for (const tool of policy.planned_tools) assert.match(readme, new RegExp(`\\b${tool}\\b`, "u"));
for (const phrase of ["must not duplicate", "must not auto-approve", "must not update"]) {
  assert.match(boundary.toLowerCase(), new RegExp(phrase, "u"));
}

async function files(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    }))).flat();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

const forbiddenImplementation = [
  /(?:case|if)\s*\(?\s*["'](?:deny|allow|require|require-path)["']/u,
  /(?:approve|accept).*evolution/iu,
  /(?:writeFile|rename|rm)\s*\([^\n]*(?:architecture|baseline)/iu,
];
for (const path of await files(join(root, "src"))) {
  const source = await readFile(path, "utf8");
  for (const pattern of forbiddenImplementation) {
    assert.doesNotMatch(source, pattern, `${relative(root, path)} crosses the MCP ownership boundary`);
  }
}

const trackedText = [readme, boundary, JSON.stringify(policy)];
assert.doesNotMatch(trackedText.join("\n"), /(?:github_pat_|ghp_|sk-(?:live|test|proj)-)[A-Za-z0-9_-]{8,}/u);
console.log(`PASS MCP BOUNDARY (${policy.planned_tools.length} planned tools; implementation remains dependency-gated)`);
