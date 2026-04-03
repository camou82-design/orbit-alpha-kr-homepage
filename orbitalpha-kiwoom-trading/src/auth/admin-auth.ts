import type { AppConfig } from "../infra/config.js";
import type { UserRole } from "./types.js";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/**
 * Local credential check. Empty stored password → that account cannot log in.
 */
export function authenticate(
  username: string,
  password: string,
  config: AppConfig
): UserRole | null {
  const u = username.trim();
  if (!u || password === "") return null;

  if (
    u === config.viewerUsername &&
    config.viewerPassword !== "" &&
    timingSafeEqual(password, config.viewerPassword)
  ) {
    return "viewer";
  }
  if (
    u === config.adminUsername &&
    config.adminPassword !== "" &&
    timingSafeEqual(password, config.adminPassword)
  ) {
    return "trader";
  }
  if (
    u === config.traderUsername &&
    config.traderPassword !== "" &&
    timingSafeEqual(password, config.traderPassword)
  ) {
    return "trader";
  }

  return null;
}
