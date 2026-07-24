import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  LibraryValidationError,
  parseProfileFrontmatter,
  validateLibrary
} from "../scripts/validate-library.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validProfile = `---
id: dokploy-issue-investigation
name: Dokploy Issue Investigation
type: service
policy_version: 1
---

# Dokploy Issue Investigation

Evidence first.
`;

const validCaseStudy = `# Issue 4898

https://github.com/Dokploy/dokploy/issues/4898

Snapshot: 73e4fdd757da90fb1fe347a92b92237e6712f98d
`;

const validExtensionManifest = {
  id: "dokploy-github",
  name: "Dokploy GitHub",
  version: "1.0.0",
  connection: { kind: "none" },
  mcpServer: {
    transport: "stdio",
    command: "node",
    args: ["./server.cjs"],
    requiresConnection: false
  },
  allowed_profiles: []
};

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "neatcontext-dokploy-test-"));
  await mkdir(join(root, "profiles"), { recursive: true });
  await mkdir(join(root, "knowledge", "dokploy", "case-studies"), { recursive: true });
  await mkdir(join(root, "extensions", "dokploy-github"), { recursive: true });
  await mkdir(join(root, "private"), { recursive: true });
  await mkdir(join(root, "templates"), { recursive: true });
  await writeFile(join(root, "library.json"), '{"neatcontext":1}\n');
  await writeFile(join(root, "README.md"), "# Fixture\n");
  await writeFile(join(root, "DESIGN.md"), "# Design\n");
  await writeFile(join(root, "CONTRIBUTING.md"), "# Contributing\n");
  await writeFile(join(root, "profiles", "dokploy.md"), validProfile);
  await writeFile(join(root, "knowledge", "dokploy", "README.md"), "# Dokploy\n");
  await writeFile(
    join(root, "knowledge", "dokploy", "case-studies", "issue-4898-preview-deployments.md"),
    validCaseStudy
  );
  await writeFile(join(root, "templates", "private-case.md"), "# Private case\n");
  await writeFile(
    join(root, "extensions", "dokploy-github", "neatcontext-extension.json"),
    `${JSON.stringify(validExtensionManifest, null, 2)}\n`
  );
  await writeFile(
    join(root, "extensions", "dokploy-github", "server.cjs"),
    '"use strict";\n'
  );
  return root;
}

test("parses the typed fields NeatContext uses to discover a profile", () => {
  assert.deepEqual(parseProfileFrontmatter(validProfile, "fixture.md"), {
    id: "dokploy-issue-investigation",
    name: "Dokploy Issue Investigation",
    type: "service",
    policyVersion: 1,
    body: "\n# Dokploy Issue Investigation\n\nEvidence first.\n"
  });
});

test("rejects malformed typed profile metadata", () => {
  assert.throws(
    () =>
      parseProfileFrontmatter(
        "---\nid: Bad ID\nname: Broken\ntype: unknown\npolicy_version: 0\n---\n# Broken\n"
      ),
    /kebab-case/
  );
  assert.throws(
    () => parseProfileFrontmatter("# No frontmatter\n"),
    /must start with YAML frontmatter/
  );
});

test("validates a complete Team Library without reading private case contents", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "private", "cases", "local-only", "evidence"), { recursive: true });
  await writeFile(
    join(root, "private", "cases", "local-only", "evidence", "secret-shaped.log"),
    "the validator must not inspect user-owned private evidence"
  );

  assert.deepEqual(await validateLibrary(root, { checkGit: false }), {
    formatVersion: 1,
    profiles: 1,
    knowledgeFolders: 1,
    knowledgeFiles: 2,
    extensions: 1
  });
});

test("reports marker, duplicate profile, and direct knowledge layout failures together", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "library.json"), '{"neatcontext":2}\n');
  await writeFile(join(root, "profiles", "duplicate.md"), validProfile);
  await writeFile(join(root, "knowledge", "orphan.md"), "# Not discoverable\n");

  await assert.rejects(
    validateLibrary(root, { checkGit: false }),
    (error) => {
      assert.ok(error instanceof LibraryValidationError);
      assert.ok(error.issues.some((issue) => issue.includes('{"neatcontext": 1}')));
      assert.ok(error.issues.some((issue) => issue.includes("duplicate profile id")));
      assert.ok(error.issues.some((issue) => issue.includes("top-level knowledge folder")));
      return true;
    }
  );
});

test("rejects broken local Markdown links in shared content", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "knowledge", "dokploy", "README.md"),
    "# Dokploy\n\n[Missing investigation guide](missing.md)\n"
  );

  await assert.rejects(
    validateLibrary(root, { checkGit: false }),
    (error) => {
      assert.ok(error instanceof LibraryValidationError);
      assert.ok(error.issues.some((issue) => issue.includes("local link target does not exist")));
      return true;
    }
  );
});

test("rejects multi-file private case templates", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "templates", "private-case"), { recursive: true });
  await writeFile(join(root, "templates", "private-case", "symptoms.md"), "# Symptoms\n");

  await assert.rejects(
    validateLibrary(root, { checkGit: false }),
    (error) => {
      assert.ok(error instanceof LibraryValidationError);
      assert.ok(
        error.issues.some((issue) =>
          issue.includes("private cases use only the single templates/private-case.md file")
        )
      );
      return true;
    }
  );
});

test("rejects a Dokploy GitHub extension that could require credentials", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "extensions", "dokploy-github", "neatcontext-extension.json"),
    `${JSON.stringify(
      {
        ...validExtensionManifest,
        connection: { kind: "bearer" },
        mcpServer: {
          ...validExtensionManifest.mcpServer,
          requiresConnection: true
        }
      },
      null,
      2
    )}\n`
  );

  await assert.rejects(
    validateLibrary(root, { checkGit: false }),
    (error) => {
      assert.ok(error instanceof LibraryValidationError);
      assert.ok(error.issues.some((issue) => issue.includes('connection.kind must be "none"')));
      assert.ok(error.issues.some((issue) => issue.includes("connection-free stdio server")));
      return true;
    }
  );
});

test("the checked-in repository is a valid Dokploy Team Library", async () => {
  const summary = await validateLibrary(repositoryRoot);
  assert.equal(summary.formatVersion, 1);
  assert.equal(summary.profiles, 1);
  assert.equal(summary.knowledgeFolders, 1);
  assert.ok(summary.knowledgeFiles >= 5);
  assert.equal(summary.extensions, 1);
});
