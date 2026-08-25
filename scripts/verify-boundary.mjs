import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const policy = JSON.parse(await readFile(join(root, "boundary-policy.json"), "utf8"));
const readme = await readFile(join(root, "README.md"), "utf8");
const boundary = await readFile(join(root, "docs", "BOUNDARY.md"), "utf8");

assert.equal(policy.schema_version, 1);
assert.equal(policy.status, "technical-foundation-awaits-upstream-and-human-acceptance");
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

const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8",
  shell: false,
  windowsHide: true,
});
assert.equal(listed.status, 0, listed.stderr);
const credentialPattern = /(?:github_pat_|ghp_|sk-(?:live|test|proj)-)[A-Za-z0-9_-]{8,}/u;
for (const name of listed.stdout.split("\0").filter(Boolean)) {
  const metadata = await lstat(join(root, name));
  assert.equal(metadata.isSymbolicLink(), false, `${name} must not be a symbolic link`);
  assert.equal(metadata.isFile(), true, `${name} must be a regular file`);
  const content = await readFile(join(root, name));
  if (content.includes(0)) continue;
  assert.doesNotMatch(content.toString("utf8"), credentialPattern, `${name} contains a credential-shaped value`);
}
console.log(`PASS MCP BOUNDARY (${policy.planned_tools.length} tools; technical foundation remains acceptance-gated)`);
