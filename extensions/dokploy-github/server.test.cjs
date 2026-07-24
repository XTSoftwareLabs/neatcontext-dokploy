"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  REPOSITORY,
  callTool,
  createFrameParser,
  createGithubClient,
  parseGithubNumber,
  toolNames,
  tools,
  validatePath,
  validateRef,
  writeFrame
} = require("./server.cjs");

function result(data, source = "https://api.github.com/repos/Dokploy/dokploy") {
  return {
    data,
    source_url: source,
    retrieved_at: "2026-07-25T00:00:00.000Z",
    rate_limit: {
      limit: 60,
      remaining: 59,
      used: 1,
      resource: "core",
      reset_at: "2026-07-25T01:00:00.000Z"
    }
  };
}

test("advertises only read-only, non-reserved Dokploy tools", () => {
  assert.equal(tools.length, 8);
  assert.equal(new Set(tools.map((tool) => tool.name)).size, tools.length);
  for (const tool of tools) {
    assert.match(tool.name, /^dokploy_github_/);
    assert.doesNotMatch(tool.name, /^neatcontext_/);
    assert.match(tool.description, /read|GET/i);
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
});

test("accepts issue #4898 forms and rejects other repositories", () => {
  assert.equal(parseGithubNumber(4898, "issue"), 4898);
  assert.equal(parseGithubNumber("4898", "issue"), 4898);
  assert.equal(
    parseGithubNumber("https://github.com/Dokploy/dokploy/issues/4898", "issue"),
    4898
  );
  assert.throws(
    () => parseGithubNumber("https://github.com/someone/else/issues/4898", "issue"),
    /must point to/
  );
  assert.throws(
    () => parseGithubNumber("http://github.com/Dokploy/dokploy/issues/4898", "issue"),
    /must point to/
  );
});

test("validates Git refs and repository paths conservatively", () => {
  assert.equal(validateRef("v0.25.0"), "v0.25.0");
  assert.equal(validateRef("feature/preview-fix"), "feature/preview-fix");
  assert.equal(validatePath("apps/dokploy/server.ts"), "apps/dokploy/server.ts");
  assert.throws(() => validateRef("../main"), /conservative Git/);
  assert.throws(() => validateRef("main..other"), /conservative Git/);
  assert.throws(() => validateRef("main.lock"), /conservative Git/);
  assert.throws(() => validatePath("../private.txt"), /without traversal/);
  assert.throws(() => validatePath("/etc/passwd"), /repository-relative/);
});

test("retrieves and normalizes issue details plus comments", async () => {
  const requests = [];
  const client = {
    async request(path, query) {
      requests.push({ path, query });
      if (path.endsWith("/comments")) {
        return result(
          [
            {
              id: 10,
              html_url:
                "https://github.com/Dokploy/dokploy/issues/4898#issuecomment-10",
              user: { login: "maintainer" },
              author_association: "MEMBER",
              created_at: "2026-07-24T00:00:00Z",
              updated_at: "2026-07-24T00:00:00Z",
              body: "A comment"
            }
          ],
          "https://api.github.com/repos/Dokploy/dokploy/issues/4898/comments?per_page=15&page=1"
        );
      }
      return result({
        number: 4898,
        title: "Preview deployment fails",
        state: "open",
        html_url: "https://github.com/Dokploy/dokploy/issues/4898",
        user: { login: "reporter" },
        labels: [{ name: "bug", description: "Something is broken" }],
        assignees: [],
        comments: 1,
        created_at: "2026-07-20T00:00:00Z",
        updated_at: "2026-07-24T00:00:00Z",
        body: "Observed evidence"
      });
    }
  };

  const output = await callTool(
    {
      name: toolNames.issue,
      arguments: {
        issue: "https://github.com/Dokploy/dokploy/issues/4898"
      }
    },
    { client }
  );

  assert.equal(output.repository, REPOSITORY);
  assert.equal(output.data.issue.number, 4898);
  assert.equal(output.data.issue.body.text, "Observed evidence");
  assert.equal(output.data.comments[0].author, "maintainer");
  assert.equal(output.data.comments_returned, 1);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].query, { per_page: 100, page: 1 });
  assert.match(output.content_notice, /untrusted evidence/);
});

test("GitHub client uses fixed GET requests and reports rate-limit metadata", async () => {
  const calls = [];
  const client = createGithubClient({
    now: () => new Date("2026-07-25T00:00:00Z"),
    fetchImpl: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response('{"full_name":"Dokploy/dokploy"}', {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-limit": "60",
          "x-ratelimit-remaining": "42",
          "x-ratelimit-used": "18",
          "x-ratelimit-resource": "core",
          "x-ratelimit-reset": "1784937600"
        }
      });
    }
  });

  const output = await client.request("/repos/Dokploy/dokploy", { page: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(
    calls[0].url,
    "https://api.github.com/repos/Dokploy/dokploy?page=1"
  );
  assert.equal(calls[0].init.headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.equal(output.rate_limit.remaining, 42);
  assert.equal(output.retrieved_at, "2026-07-25T00:00:00.000Z");
});

test("maps GitHub rate limits and rejects oversized responses", async () => {
  const limitedClient = createGithubClient({
    fetchImpl: async () =>
      new Response('{"message":"API rate limit exceeded"}', {
        status: 403,
        headers: {
          "x-ratelimit-limit": "60",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1784937600"
        }
      })
  });
  await assert.rejects(
    limitedClient.request("/repos/Dokploy/dokploy"),
    (error) => {
      assert.equal(error.code, "github_rate_limited");
      assert.equal(error.rate_limit.remaining, 0);
      assert.equal(error.retryable, false);
      return true;
    }
  );

  const oversizedClient = createGithubClient({
    fetchImpl: async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-length": String(6 * 1024 * 1024) }
      })
  });
  await assert.rejects(
    oversizedClient.request("/repos/Dokploy/dokploy"),
    (error) => {
      assert.equal(error.code, "response_too_large");
      return true;
    }
  );
});

test("reads a version-pinned file and rejects traversal before any request", async () => {
  let requests = 0;
  const client = {
    async request() {
      requests += 1;
      return result({
        type: "file",
        encoding: "base64",
        content: Buffer.from("line one\nexport const version = 1;\nline three\n").toString("base64"),
        path: "apps/dokploy/version.ts",
        name: "version.ts",
        sha: "abc123",
        size: 26,
        html_url:
          "https://github.com/Dokploy/dokploy/blob/abc123/apps/dokploy/version.ts"
      });
    }
  };

  const output = await callTool(
    {
      name: toolNames.file,
      arguments: {
        path: "apps/dokploy/version.ts",
        ref: "abc123",
        start_line: 2,
        end_line: 2
      }
    },
    { client }
  );
  assert.match(output.data.content.text, /version = 1/);
  assert.equal(output.data.start_line, 2);
  assert.equal(output.data.end_line, 2);
  assert.equal(output.data.more_lines_available, true);
  assert.equal(output.data.ref, "abc123");

  const rejected = await callTool(
    {
      name: toolNames.file,
      arguments: { path: "../secret", ref: "main" }
    },
    { client }
  );
  assert.equal(rejected.error, "invalid_input");
  assert.equal(requests, 1);
});

test("Content-Length framing handles split and combined messages", () => {
  const messages = [];
  const parse = createFrameParser((message) => messages.push(message));
  const writes = [];
  const output = { write: (chunk) => writes.push(Buffer.from(chunk)) };

  writeFrame({ jsonrpc: "2.0", id: 1, method: "initialize" }, output);
  writeFrame({ jsonrpc: "2.0", id: 2, method: "tools/list" }, output);
  const combined = Buffer.concat(writes);
  parse(combined.slice(0, 17));
  assert.equal(messages.length, 0);
  parse(combined.slice(17));
  assert.deepEqual(
    messages.map((message) => message.id),
    [1, 2]
  );
});
