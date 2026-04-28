import { createHmac, timingSafeEqual } from "crypto";

import type { SessionRole } from "@/lib/api/contracts";

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface SessionTokenPayload {
  role: SessionRole;
  userId: string;
  exp: number;
}

function getSessionSecret() {
  return process.env.SESSION_SECRET ?? "dev-session-secret-change-me";
}

function toBase64Url(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

export function createSessionToken(input: {
  role: SessionRole;
  userId: string;
  ttlMs?: number;
}) {
  const payload: SessionTokenPayload = {
    role: input.role,
    userId: input.userId,
    exp: Date.now() + (input.ttlMs ?? DEFAULT_SESSION_TTL_MS)
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionTokenPayload;
    if (!payload.userId || !payload.role || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
