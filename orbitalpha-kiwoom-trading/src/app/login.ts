import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { authenticate } from "../auth/admin-auth.js";
import { createSession, type UserSession } from "../auth/session.js";
import type { AppConfig } from "../infra/config.js";

/**
 * Interactive username/password (console). Returns null on failure.
 */
export async function runLoginPrompt(config: AppConfig): Promise<UserSession | null> {
  const rl = readline.createInterface({ input, output });
  try {
    const username = (await rl.question("Username: ")).trim();
    const password = await rl.question("Password: ");
    const role = authenticate(username, password, config);
    if (!role) {
      console.error("Login failed.");
      return null;
    }
    return createSession(username, role);
  } finally {
    rl.close();
  }
}
