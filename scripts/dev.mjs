#!/usr/bin/env node
/**
 * Runs the API (http://localhost:3400) and the web UI (http://localhost:5173)
 * together with prefixed output. Ctrl+C stops both.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

for (const dir of ["backend-node", "web-ui"]) {
  if (!existsSync(`${dir}/node_modules`)) {
    console.error(`Dependencies missing in ${dir}/. Run "npm run setup" first.`);
    process.exit(1);
  }
}

const procs = [
  ["api", "backend-node", "\x1b[36m"],
  ["web", "web-ui", "\x1b[35m"],
].map(([name, cwd, color]) => {
  const child = spawn("npm", ["run", "dev"], { cwd, shell: process.platform === "win32", env: process.env });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on("data", (chunk) =>
      chunk
        .toString()
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => out.write(prefix + line + "\n"))
    );
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  procs.forEach((p) => p.exitCode === null && p.kill("SIGTERM"));
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
console.log("\nMailPilot dev: open http://localhost:5173  (API on http://localhost:3400)\n");
