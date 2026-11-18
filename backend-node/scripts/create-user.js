#!/usr/bin/env node
/**
 * Creates a password account. Useful when ALLOW_REGISTRATION=false (the
 * production default), so only people you invite can send through your SMTP.
 *
 *   npm run create-user -- you@example.com "Your Name"
 *   (the password is read from the MAILPILOT_PASSWORD env var or prompted)
 */
require("dotenv").config({ quiet: true });
const readline = require("readline");
const { loadConfig } = require("../src/config");
const { createDatabase } = require("../src/db");
const { createAuthService } = require("../src/services/authService");

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    rl.stdoutMuted = true;
    rl._writeToOutput = (s) => rl.output.write(rl.stdoutMuted && !s.startsWith(question) ? "" : s);
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

(async () => {
  const [email, name] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: npm run create-user -- <email> ["Full Name"]');
    process.exit(1);
  }
  const password = process.env.MAILPILOT_PASSWORD || (await prompt("Password (min 8 characters): "));
  const config = loadConfig();
  const db = await createDatabase(config);
  const auth = createAuthService({ db, config });
  try {
    await auth.createUser({ email, password, name });
    console.log(`Created user ${email.toLowerCase()}.`);
  } finally {
    await db.close();
  }
})().catch((err) => {
  console.error(`Could not create user: ${err.message}`);
  process.exit(1);
});
