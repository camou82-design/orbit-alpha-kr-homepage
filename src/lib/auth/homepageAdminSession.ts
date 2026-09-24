const COOKIE_NAME = "homepage_admin_auth";

function getSecretKey(): Uint8Array | null {
  const secret = (process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SECRET_KEY)?.trim();
  if (!secret || secret.length === 0) {
    return null;
  }
  return new TextEncoder().encode(secret);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array | null {
  try {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function signData(data: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as ArrayBufferView<ArrayBuffer>,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, data as ArrayBufferView<ArrayBuffer>);
  return new Uint8Array(sigBuffer);
}

async function verifySig(data: Uint8Array, sig: Uint8Array, keyBytes: Uint8Array): Promise<boolean> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as ArrayBufferView<ArrayBuffer>,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return await crypto.subtle.verify("HMAC", cryptoKey, sig as ArrayBufferView<ArrayBuffer>, data as ArrayBufferView<ArrayBuffer>);
}

export interface AdminSessionPayload {
  role: "admin";
  iat: number;
  exp: number;
}

export async function createSignedAdminSession(expirySeconds = 7 * 24 * 3600): Promise<string | null> {
  const keyBytes = getSecretKey();
  if (!keyBytes) {
    console.error("[auth] ADMIN_SESSION_SECRET is not configured. Failing closed.");
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    role: "admin",
    iat: nowSec,
    exp: nowSec + expirySeconds
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const payloadB64 = base64UrlEncode(payloadBytes);

  const signatureBytes = await signData(payloadBytes, keyBytes);
  const signatureB64 = base64UrlEncode(signatureBytes);

  return `${payloadB64}.${signatureB64}`;
}

export async function verifyAdminSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token || typeof token !== "string" || token.trim() === "") {
    return false;
  }

  // Reject simple strings like "authenticated"
  if (!token.includes(".")) {
    return false;
  }

  const keyBytes = getSecretKey();
  if (!keyBytes) {
    console.error("[auth] ADMIN_SESSION_SECRET is not configured for token verification. Failing closed.");
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payloadB64, signatureB64] = parts;
  const payloadBytes = base64UrlDecode(payloadB64);
  const signatureBytes = base64UrlDecode(signatureB64);

  if (!payloadBytes || !signatureBytes) {
    return false;
  }

  const isValidSig = await verifySig(payloadBytes, signatureBytes, keyBytes);
  if (!isValidSig) {
    return false;
  }

  try {
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadJson) as AdminSessionPayload;
    if (!payload || payload.role !== "admin") {
      return false;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
      return false; // Expired
    }
    return true;
  } catch {
    return false;
  }
}

export async function verifyAdminSessionRequest(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;
  return verifyAdminSessionToken(token);
}

export { COOKIE_NAME as ADMIN_COOKIE_NAME };
