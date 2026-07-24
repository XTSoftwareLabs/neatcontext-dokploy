import { spawnSync } from "node:child_process";
import {
  access,
  readFile,
  readdir,
  stat
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import {
  dirname,
  extname,
  join,
  relative,
  resolve
} from "node:path";
import { fileURLToPath } from "node:url";

const profileTypes = new Set([
  "global",
  "team",
  "service",
  "environment",
  "customer",
  "incident-class"
]);

const profileExtensions = new Set([".md", ".markdown"]);
const knowledgeExtensions = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".csv",
  ".html"
]);

const requiredDirectories = [
  "profiles",
  "knowledge",
  "extensions",
  "private",
  "templates"
];

const requiredTemplateFiles = [
  "templates/private-case.md"
];

export class LibraryValidationError extends Error {
  constructor(issues) {
    super(`Team Library validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "LibraryValidationError";
    this.issues = issues;
  }
}

function toPosixPath(path) {
  return path.replaceAll("\\", "/");
}

function unquoteYamlScalar(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function scalarFromFrontmatter(frontmatter, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = frontmatter.match(new RegExp(`^${escapedKey}\\s*:\\s*(.*?)\\s*$`, "m"));
  return match ? unquoteYamlScalar(match[1]) : undefined;
}

export function parseProfileFrontmatter(markdown, source = "profile") {
  const normalized = markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error(`${source}: profile must start with YAML frontmatter`);
  }

  const closingOffset = normalized.indexOf("\n---\n", 4);
  if (closingOffset < 0) {
    throw new Error(`${source}: profile is missing the closing frontmatter delimiter`);
  }

  const frontmatter = normalized.slice(4, closingOffset);
  const body = normalized.slice(closingOffset + 5);
  const id = scalarFromFrontmatter(frontmatter, "id");
  const name = scalarFromFrontmatter(frontmatter, "name");
  const type = scalarFromFrontmatter(frontmatter, "type");
  const policyVersion = scalarFromFrontmatter(frontmatter, "policy_version");

  if (!id) {
    throw new Error(`${source}: frontmatter id is required`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`${source}: frontmatter id must be a lowercase kebab-case identifier`);
  }
  if (!name) {
    throw new Error(`${source}: frontmatter name is required`);
  }
  if (!type || !profileTypes.has(type)) {
    throw new Error(
      `${source}: frontmatter type must be one of ${[...profileTypes].join(", ")}`
    );
  }
  if (policyVersion !== undefined) {
    if (!/^[1-9]\d*$/.test(policyVersion)) {
      throw new Error(`${source}: policy_version must be a positive integer`);
    }
  }
  if (!/^#\s+\S.+$/m.test(body)) {
    throw new Error(`${source}: profile body must contain an H1 heading`);
  }

  return {
    id,
    name,
    type,
    policyVersion: policyVersion === undefined ? undefined : Number(policyVersion),
    body
  };
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function collectFiles(root, issues, libraryRoot) {
  const files = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    issues.push(`${toPosixPath(relative(libraryRoot, root))}: cannot read directory (${error.message})`);
    return files;
  }

  for (const entry of entries) {
    const path = join(root, entry.name);
    const displayPath = toPosixPath(relative(libraryRoot, path));
    if (entry.isSymbolicLink()) {
      issues.push(`${displayPath}: symbolic links are not allowed in shared resources`);
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, issues, libraryRoot)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function validateMarker(root, issues) {
  const markerPath = join(root, "library.json");
  let marker;
  try {
    marker = JSON.parse(await readFile(markerPath, "utf8"));
  } catch (error) {
    issues.push(`library.json: missing or invalid JSON (${error.message})`);
    return;
  }

  if (
    !marker ||
    Array.isArray(marker) ||
    typeof marker !== "object" ||
    marker.neatcontext !== 1
  ) {
    issues.push('library.json: expected the Team Library marker {"neatcontext": 1}');
  }
}

async function validateProfiles(root, issues) {
  const profilesRoot = join(root, "profiles");
  const allFiles = await collectFiles(profilesRoot, issues, root);
  const profileFiles = allFiles.filter((path) =>
    profileExtensions.has(extname(path).toLowerCase())
  );

  if (profileFiles.length === 0) {
    issues.push("profiles: at least one .md or .markdown domain profile is required");
  }

  const seenIds = new Map();
  const profiles = [];
  for (const path of profileFiles) {
    const displayPath = toPosixPath(relative(root, path));
    try {
      const parsed = parseProfileFrontmatter(await readFile(path, "utf8"), displayPath);
      if (seenIds.has(parsed.id)) {
        issues.push(
          `${displayPath}: duplicate profile id "${parsed.id}" also used by ${seenIds.get(parsed.id)}`
        );
      } else {
        seenIds.set(parsed.id, displayPath);
      }
      profiles.push({ path: displayPath, ...parsed });
    } catch (error) {
      issues.push(error.message);
    }
  }

  const dokployProfile = profiles.find((profile) => profile.path === "profiles/dokploy.md");
  if (!dokployProfile) {
    issues.push("profiles/dokploy.md: the shared Dokploy profile is required");
  } else {
    if (dokployProfile.id !== "dokploy-issue-investigation") {
      issues.push('profiles/dokploy.md: expected id "dokploy-issue-investigation"');
    }
    if (dokployProfile.name !== "Dokploy Issue Investigation") {
      issues.push('profiles/dokploy.md: expected name "Dokploy Issue Investigation"');
    }
    if (dokployProfile.type !== "service") {
      issues.push('profiles/dokploy.md: expected type "service"');
    }
    if (dokployProfile.policyVersion === undefined) {
      issues.push("profiles/dokploy.md: a positive policy_version is required");
    }
  }

  return profiles;
}

async function validateKnowledge(root, issues) {
  const knowledgeRoot = join(root, "knowledge");
  let entries = [];
  try {
    entries = await readdir(knowledgeRoot, { withFileTypes: true });
  } catch (error) {
    issues.push(`knowledge: cannot read directory (${error.message})`);
  }

  const folders = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink());
  const directKnowledgeFiles = entries.filter(
    (entry) => entry.isFile() && knowledgeExtensions.has(extname(entry.name).toLowerCase())
  );
  for (const entry of directKnowledgeFiles) {
    issues.push(
      `knowledge/${entry.name}: put documents inside a top-level knowledge folder so NeatContext discovers them`
    );
  }
  for (const entry of entries.filter((entry) => entry.isSymbolicLink())) {
    issues.push(`knowledge/${entry.name}: symbolic links are not allowed in shared resources`);
  }
  if (folders.length === 0) {
    issues.push("knowledge: at least one top-level knowledge folder is required");
  }

  let knowledgeFileCount = 0;
  const folderSummaries = [];
  for (const folder of folders) {
    const folderPath = join(knowledgeRoot, folder.name);
    const files = await collectFiles(folderPath, issues, root);
    const searchableFiles = files.filter((path) =>
      knowledgeExtensions.has(extname(path).toLowerCase())
    );
    if (searchableFiles.length === 0) {
      issues.push(`knowledge/${folder.name}: no searchable text documents found`);
    }
    knowledgeFileCount += searchableFiles.length;
    folderSummaries.push({ name: folder.name, files: searchableFiles.length });
  }

  if (!folderSummaries.some((folder) => folder.name === "dokploy")) {
    issues.push("knowledge/dokploy: the shared Dokploy knowledge folder is required");
  }

  const caseStudyPath = join(
    knowledgeRoot,
    "dokploy",
    "case-studies",
    "issue-4898-preview-deployments.md"
  );
  try {
    const caseStudy = await readFile(caseStudyPath, "utf8");
    if (!caseStudy.includes("https://github.com/Dokploy/dokploy/issues/4898")) {
      issues.push("issue #4898 case study: primary upstream issue link is required");
    }
    if (!caseStudy.includes("73e4fdd757da90fb1fe347a92b92237e6712f98d")) {
      issues.push("issue #4898 case study: immutable source snapshot is required");
    }
  } catch (error) {
    issues.push(
      `knowledge/dokploy/case-studies/issue-4898-preview-deployments.md: missing or unreadable (${error.message})`
    );
  }

  return { folders: folderSummaries, files: knowledgeFileCount };
}

async function validateExtensions(root, issues) {
  const extensionsRoot = join(root, "extensions");
  let entries = [];
  try {
    entries = await readdir(extensionsRoot, { withFileTypes: true });
  } catch (error) {
    issues.push(`extensions: cannot read directory (${error.message})`);
    return [];
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      issues.push(`extensions/${entry.name}: symbolic links are not allowed`);
    } else if (!entry.isDirectory()) {
      issues.push(`extensions/${entry.name}: extension packages must be directories`);
    }
  }

  const folders = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink());
  if (!folders.some((entry) => entry.name === "dokploy-github")) {
    issues.push("extensions/dokploy-github: the read-only GitHub extension is required");
  }

  const extensions = [];
  for (const folder of folders) {
    const folderPath = join(extensionsRoot, folder.name);
    await collectFiles(folderPath, issues, root);
    const manifestPath = join(folderPath, "neatcontext-extension.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      issues.push(
        `extensions/${folder.name}/neatcontext-extension.json: missing or invalid JSON (${error.message})`
      );
      continue;
    }

    if (
      !manifest ||
      Array.isArray(manifest) ||
      typeof manifest !== "object" ||
      !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id ?? "")
    ) {
      issues.push(
        `extensions/${folder.name}/neatcontext-extension.json: a lowercase kebab-case id is required`
      );
      continue;
    }
    if (manifest.id !== folder.name) {
      issues.push(
        `extensions/${folder.name}/neatcontext-extension.json: id must match its folder name`
      );
    }
    extensions.push({ id: manifest.id, path: folder.name });

    if (folder.name !== "dokploy-github") {
      continue;
    }
    if (manifest.connection?.kind !== "none") {
      issues.push(
        'extensions/dokploy-github/neatcontext-extension.json: connection.kind must be "none"'
      );
    }
    if (
      manifest.mcpServer?.transport !== "stdio" ||
      manifest.mcpServer?.command !== "node" ||
      !Array.isArray(manifest.mcpServer?.args) ||
      manifest.mcpServer.args.length !== 1 ||
      manifest.mcpServer.args[0] !== "./server.cjs" ||
      manifest.mcpServer?.requiresConnection !== false
    ) {
      issues.push(
        "extensions/dokploy-github/neatcontext-extension.json: expected the connection-free stdio server ./server.cjs"
      );
    }
    if (!Array.isArray(manifest.allowed_profiles)) {
      issues.push(
        "extensions/dokploy-github/neatcontext-extension.json: allowed_profiles must be an array"
      );
    }
    try {
      const server = await readFile(join(folderPath, "server.cjs"), "utf8");
      if (!server.includes('"use strict"')) {
        issues.push("extensions/dokploy-github/server.cjs: self-contained server is missing");
      }
      if (/\bname:\s*["']neatcontext_/i.test(server)) {
        issues.push(
          "extensions/dokploy-github/server.cjs: the neatcontext_ tool prefix is reserved"
        );
      }
    } catch (error) {
      issues.push(
        `extensions/dokploy-github/server.cjs: missing or unreadable (${error.message})`
      );
    }
  }

  return extensions;
}

async function validatePrivateBoundary(root, issues, checkGit) {
  for (const templatePath of requiredTemplateFiles) {
    try {
      await access(join(root, templatePath), fsConstants.R_OK);
    } catch {
      issues.push(`${templatePath}: required private-case template file is missing`);
    }
  }

  const templateFiles = await collectFiles(join(root, "templates"), issues, root);
  const unexpectedTemplates = templateFiles
    .map((path) => toPosixPath(relative(root, path)))
    .filter((path) => path !== "templates/private-case.md");
  for (const path of unexpectedTemplates) {
    issues.push(`${path}: private cases use only the single templates/private-case.md file`);
  }

  if (!checkGit) {
    return;
  }

  const ignoreProbe = "private/__neatcontext_private_validation_probe__.log";
  const ignoreResult = spawnSync(
    "git",
    ["check-ignore", "--no-index", "--quiet", ignoreProbe],
    { cwd: root, encoding: "utf8" }
  );
  if (ignoreResult.status !== 0) {
    issues.push("private/: .gitignore does not protect arbitrary private case files");
  }

  const trackedResult = spawnSync("git", ["ls-files", "--", "private"], {
    cwd: root,
    encoding: "utf8"
  });
  if (trackedResult.status !== 0) {
    issues.push(`private/: could not inspect tracked files (${trackedResult.stderr.trim()})`);
    return;
  }
  const improperlyTracked = trackedResult.stdout
    .split(/\r?\n/)
    .map((path) => toPosixPath(path.trim()))
    .filter(Boolean)
    .filter((path) => path !== "private/.gitkeep");
  for (const path of improperlyTracked) {
    issues.push(`${path}: private case material must not be tracked by Git`);
  }
}

async function validateLocalMarkdownLinks(root, issues) {
  const markdownFiles = [];
  for (const path of ["README.md", "DESIGN.md", "CONTRIBUTING.md"]) {
    try {
      await access(join(root, path), fsConstants.R_OK);
      markdownFiles.push(join(root, path));
    } catch {
      issues.push(`${path}: required repository documentation is missing`);
    }
  }
  for (const directory of ["profiles", "knowledge", "templates"]) {
    const files = await collectFiles(join(root, directory), issues, root);
    markdownFiles.push(
      ...files.filter((path) => profileExtensions.has(extname(path).toLowerCase()))
    );
  }

  const linkPattern = /\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const markdownPath of markdownFiles) {
    const markdown = await readFile(markdownPath, "utf8");
    const displayPath = toPosixPath(relative(root, markdownPath));
    for (const match of markdown.matchAll(linkPattern)) {
      const target = match[1].replace(/^<|>$/g, "");
      if (
        target.startsWith("#") ||
        target.startsWith("//") ||
        /^[a-z][a-z0-9+.-]*:/i.test(target)
      ) {
        continue;
      }
      const pathPart = target.split("#", 1)[0];
      if (!pathPart) {
        continue;
      }
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(pathPart);
      } catch {
        issues.push(`${displayPath}: invalid URL encoding in local link "${target}"`);
        continue;
      }
      try {
        await access(resolve(dirname(markdownPath), decodedPath), fsConstants.R_OK);
      } catch {
        issues.push(`${displayPath}: local link target does not exist: ${target}`);
      }
    }
  }
}

export async function validateLibrary(rootPath, options = {}) {
  const root = resolve(rootPath);
  const issues = [];

  for (const directory of requiredDirectories) {
    if (!(await isDirectory(join(root, directory)))) {
      issues.push(`${directory}: required directory is missing`);
    }
  }

  await validateMarker(root, issues);
  const profiles = await validateProfiles(root, issues);
  const knowledge = await validateKnowledge(root, issues);
  const extensions = await validateExtensions(root, issues);

  const checkGit =
    options.checkGit === undefined ? await isDirectory(join(root, ".git")) : options.checkGit;
  await validatePrivateBoundary(root, issues, checkGit);
  await validateLocalMarkdownLinks(root, issues);

  if (issues.length > 0) {
    throw new LibraryValidationError(issues);
  }

  return {
    formatVersion: 1,
    profiles: profiles.length,
    knowledgeFolders: knowledge.folders.length,
    knowledgeFiles: knowledge.files,
    extensions: extensions.length
  };
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === modulePath) {
  const root = resolve(dirname(modulePath), "..");
  try {
    const summary = await validateLibrary(root);
    console.log(
      `Valid NeatContext Team Library: ${summary.profiles} profile(s), ` +
        `${summary.knowledgeFolders} knowledge folder(s), ` +
        `${summary.knowledgeFiles} searchable document(s), ` +
        `${summary.extensions} extension(s).`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
