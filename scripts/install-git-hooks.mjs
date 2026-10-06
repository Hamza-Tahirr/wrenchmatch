// Points git at the repository's hooks (.githooks: the credential guard before every commit and
// push). Runs from `npm install` (the "prepare" script); outside a git checkout, e.g. on Vercel,
// it does nothing and never fails the install.
import { execFileSync } from "node:child_process";

try {
  const inside = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (inside === "true") {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
    console.log("Git hooks enabled (.githooks): the credential guard checks every commit and push.");
  }
} catch {
  // Not a git checkout, or git is not installed: nothing to set up.
}
