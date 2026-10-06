#!/usr/bin/env node
// Credential guard: refuses commits, pushes and CI runs that would put a secret on GitHub.
//
//   node scripts/check-secrets.mjs --staged     what `git commit` is about to record (pre-commit hook)
//   node scripts/check-secrets.mjs --pre-push   every commit `git push` is about to send (pre-push hook)
//   node scripts/check-secrets.mjs --all        every tracked file (CI, or by hand: npm run secrets:check)
//
// It blocks (1) files that hold secrets by nature (.env files other than .env.example, private
// keys, the .vercel link folder, local databases and uploads), (2) well-known token formats
// (GitHub, Vercel Blob, JWTs such as Turso and Vercel OIDC tokens, AWS, Stripe, AI provider
// keys, Slack, Google, npm, private keys) and (3) the exact values of the secrets kept in this
// computer's local env files (.env.vercel, .env.local, ...), so a real Turso or Blob token is
// caught even in a format no pattern knows. A line containing "secret-scan: allow" is skipped
// (for deliberate fake examples). Findings are printed masked; the secret itself never is.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Token formats that are always a credential. */
export const SECRET_PATTERNS = [
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ["Vercel Blob token", /\bvercel_blob_rw_[A-Za-z0-9]{8,}_[A-Za-z0-9]{20,}\b/],
  ["JSON Web Token (Turso, Vercel OIDC, ...)", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["Private key", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["Stripe secret key", /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{20,}\b/],
  ["AI provider API key",/\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["AI provider API key",/\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{40,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["npm token", /\bnpm_[A-Za-z0-9]{36}\b/],
  ["Database URL with a token", /\blibsql:\/\/[^\s"'`]*authToken=[A-Za-z0-9._-]{12,}/i],
  ["npm registry auth token", /_authToken\s*=\s*(?!\$\{)[^\s"']{12,}/],
];

const ALLOW_MARKER = "secret-scan: allow";

/** Why a path must never be committed, or null. */
export function blockedPathReason(file) {
  const p = file.replaceAll("\\", "/");
  const base = p.split("/").pop() ?? p;
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") return "environment file (secrets live in Vercel and .env.vercel)";
  if (/(^|\/)\.vercel\//.test(p)) return "Vercel CLI link folder";
  if (/(^|\/)\.data\//.test(p)) return "local database and private uploads";
  if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(base)) return "private key or certificate store";
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return "SSH private key";
  if (/\.(db|sqlite|sqlite3)(-wal|-shm|-journal)?$/i.test(base)) return "database file";
  return null;
}

/** Secret-looking values from this computer's env files (never printed). */
export function localSecretValues(root) {
  const files = [".env.vercel", ".env.local", ".env", ".env.production.local", ".env.development.local", ".env.production", ".env.development"];
  const values = [];
  for (const name of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, raw] = match;
      const value = raw.trim().replace(/^(['"])(.*)\1$/, "$2");
      if (!/TOKEN|SECRET|KEY|PASSWORD|PASS|AUTH|CREDENTIAL|PRIVATE|DATABASE_URL|DSN/i.test(key)) continue;
      if (value.length >= 12) values.push({ key, value });
    }
  }
  return values;
}

const mask = (secret) => `${secret.slice(0, 4)}…(${secret.length} chars)`;

/** Credential findings in one text: [{ line, kind, preview }]. */
export function scanText(text, localValues = []) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const [kind, pattern] of SECRET_PATTERNS) {
      const match = pattern.exec(line);
      if (match) findings.push({ line: index + 1, kind, preview: mask(match[0]) });
    }
    for (const { key, value } of localValues) {
      if (line.includes(value)) findings.push({ line: index + 1, kind: `value of ${key} from a local env file`, preview: mask(value) });
    }
  });
  return findings;
}

function git(args, input) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, input });
}

const isBinary = (text) => text.includes("\u0000");

function stagedFiles() {
  return git(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]).split("\0").filter(Boolean);
}

function trackedFiles() {
  return git(["ls-files", "-z"]).split("\0").filter(Boolean);
}

/** Commit ranges that `git push` is about to send (hook stdin: local-ref local-sha remote-ref remote-sha). */
function pushRanges(stdin) {
  const zero = /^0+$/;
  const ranges = [];
  for (const line of stdin.split(/\r?\n/)) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || zero.test(localSha)) continue; // deleting a branch
    ranges.push(remoteSha && !zero.test(remoteSha) ? [`${remoteSha}..${localSha}`] : [localSha, "--not", "--remotes"]);
  }
  return ranges;
}

function report(problems) {
  if (problems.length === 0) return 0;
  console.error("\n  ✋ Credential guard: this would put a secret on GitHub. Nothing was committed or pushed.\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\n  Keep secrets in the Vercel project settings and in git-ignored files (.env.vercel, .env.local)." +
      '\n  Unstage the file or remove the value; for a deliberate fake example add "secret-scan: allow" to that line.' +
      "\n  If a real secret was already pushed anywhere, revoke it first.\n",
  );
  return 1;
}

export function main(argv = process.argv.slice(2)) {
  const mode = argv[0] ?? "--staged";
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  process.chdir(root);
  const localValues = localSecretValues(root);
  const problems = [];
  const checkFile = (file, readContent) => {
    const reason = blockedPathReason(file);
    if (reason) {
      problems.push(`${file}: ${reason}`);
      return;
    }
    let text;
    try {
      text = readContent();
    } catch {
      return; // deleted or unreadable
    }
    if (isBinary(text)) return;
    for (const finding of scanText(text, localValues)) problems.push(`${file}:${finding.line}: ${finding.kind} (${finding.preview})`);
  };

  if (mode === "--staged") {
    for (const file of stagedFiles()) checkFile(file, () => git(["show", `:${file}`]));
  } else if (mode === "--all") {
    for (const file of trackedFiles()) checkFile(file, () => fs.readFileSync(path.join(root, file), "utf8"));
  } else if (mode === "--pre-push") {
    const stdin = fs.readFileSync(0, "utf8");
    for (const range of pushRanges(stdin)) {
      const added = git(["log", "--format=", "--name-only", "--diff-filter=A", ...range]).split(/\r?\n/).filter(Boolean);
      for (const file of new Set(added)) {
        const reason = blockedPathReason(file);
        if (reason) problems.push(`${file} (in a commit being pushed): ${reason}`);
      }
      const patch = git(["log", "-p", "--no-color", "--unified=0", "--format=commit %h", ...range]);
      let commit = "";
      let file = "";
      for (const line of patch.split(/\r?\n/)) {
        if (line.startsWith("commit ")) commit = line.slice(7);
        else if (line.startsWith("+++ b/")) file = line.slice(6);
        else if (line.startsWith("+") && !line.startsWith("+++")) {
          for (const finding of scanText(line.slice(1), localValues)) problems.push(`${file} (commit ${commit}): ${finding.kind} (${finding.preview})`);
        }
      }
    }
  } else {
    console.error(`Unknown mode ${mode}. Use --staged, --pre-push or --all.`);
    return 2;
  }
  const code = report([...new Set(problems)]);
  if (code === 0 && mode === "--all") console.log(`Credential guard: ${trackedFiles().length} tracked files checked, no secrets found.`);
  return code;
}

// Run as a command (not when imported by tests). Paths compare case-insensitively on Windows,
// where the same file can be reached as D:\… or d:\…, so the guard never skips itself silently.
const invokedDirectly = (() => {
  try {
    const self = fileURLToPath(import.meta.url);
    const entry = path.resolve(process.argv[1] ?? "");
    return process.platform === "win32" ? self.toLowerCase() === entry.toLowerCase() : self === entry;
  } catch {
    return false;
  }
})();
if (invokedDirectly) process.exit(main());
