import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type express from "express";
import type { Socket } from "socket.io";

export const VISITOR_COOKIE = "lt_vid";
const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type BanIdentity = {
  ipAddress?: string;
  visitorId?: string;
  name?: string;
}

export type BanRule = BanIdentity & {
  id: string;
  reason: string;
  createdAt: string;
  sessionId?: string;
}

export type BanMatch = {
  id: string;
  reason: string;
}

export default class BanManager {
  private bans = new Map<string, BanRule>();

  constructor(private readonly storePath = process.env.BAN_STORE_PATH || path.join(process.cwd(), "data", "bans.json")) {
    this.load();
  }

  list() {
    return [...this.bans.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  add(input: Omit<Partial<BanRule>, "id" | "createdAt"> & { reason?: string }) {
    const rule: BanRule = {
      id: randomBytes(8).toString("hex"),
      reason: sanitizeReason(input.reason),
      createdAt: new Date().toISOString(),
      ipAddress: normalizeIp(input.ipAddress),
      visitorId: sanitizeToken(input.visitorId),
      name: sanitizeName(input.name),
      sessionId: input.sessionId,
    };

    if (!rule.ipAddress && !rule.visitorId && !rule.name) {
      throw new Error("Ban requires at least an IP address, visitor ID, or name.");
    }

    this.bans.set(rule.id, rule);
    this.save();
    return rule;
  }

  delete(id: string) {
    const deleted = this.bans.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  findForRequest(req: express.Request): BanMatch | null {
    return this.findForIdentity({
      ipAddress: getClientIpFromRequest(req),
      visitorId: getVisitorIdFromRequest(req),
    });
  }

  findForSocket(socket: Socket): BanMatch | null {
    return this.findForIdentity({
      ipAddress: getClientIpFromSocket(socket),
      visitorId: getVisitorIdFromSocket(socket),
    });
  }

  findForIdentity(identity: BanIdentity): BanMatch | null {
    const ipAddress = normalizeIp(identity.ipAddress);
    const visitorId = sanitizeToken(identity.visitorId);
    const name = sanitizeName(identity.name)?.toLowerCase();

    for (const rule of this.bans.values()) {
      if (rule.ipAddress && ipAddress && rule.ipAddress === ipAddress) {
        return { id: rule.id, reason: rule.reason };
      }

      if (rule.visitorId && visitorId && rule.visitorId === visitorId) {
        return { id: rule.id, reason: rule.reason };
      }

      if (rule.name && name && rule.name.toLowerCase() === name) {
        return { id: rule.id, reason: rule.reason };
      }
    }

    return null;
  }

  private load() {
    try {
      if (!fs.existsSync(this.storePath)) {
        return;
      }

      const parsed = JSON.parse(fs.readFileSync(this.storePath, "utf8"));
      const rules = Array.isArray(parsed) ? parsed : parsed?.bans;
      if (!Array.isArray(rules)) {
        return;
      }

      rules.forEach((rule: BanRule) => {
        if (rule?.id) {
          this.bans.set(rule.id, {
            ...rule,
            ipAddress: normalizeIp(rule.ipAddress),
            visitorId: sanitizeToken(rule.visitorId),
            name: sanitizeName(rule.name),
            reason: sanitizeReason(rule.reason),
          });
        }
      });
    } catch (error) {
      console.error("Failed to load bans:", error);
    }
  }

  private save() {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(
      this.storePath,
      JSON.stringify({ bans: this.list() }, null, 2),
      "utf8",
    );
  }
}

export function ensureVisitorCookie(req: express.Request, res: express.Response) {
  const existing = getVisitorIdFromRequest(req);
  if (existing) {
    return existing;
  }

  const visitorId = randomBytes(16).toString("hex");
  res.cookie(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS * 1000,
  });
  return visitorId;
}

export function getVisitorIdFromRequest(req: express.Request) {
  return sanitizeToken(parseCookies(req.headers.cookie)[VISITOR_COOKIE]);
}

export function getVisitorIdFromSocket(socket: Socket) {
  return sanitizeToken(parseCookies(socket.handshake.headers.cookie)[VISITOR_COOKIE]);
}

export function getClientIpFromRequest(req: express.Request) {
  const forwarded = firstHeaderValue(req.headers["cf-connecting-ip"])
    || firstHeaderValue(req.headers["x-real-ip"])
    || firstHeaderValue(req.headers["x-forwarded-for"])?.split(",")[0]
    || req.ip
    || req.socket.remoteAddress
    || "";

  return normalizeIp(forwarded);
}

export function getClientIpFromSocket(socket: Socket) {
  const forwarded = firstHeaderValue(socket.handshake.headers["cf-connecting-ip"])
    || firstHeaderValue(socket.handshake.headers["x-real-ip"])
    || firstHeaderValue(socket.handshake.headers["x-forwarded-for"])?.split(",")[0]
    || socket.handshake.address
    || "";

  return normalizeIp(forwarded);
}

export function buildBannedUrl(reason: string) {
  return `/banned?reason=${encodeURIComponent(reason || "Banned by site moderation.")}`;
}

function parseCookies(cookieHeader?: string | string[]) {
  const cookies: Record<string, string> = {};
  const header = Array.isArray(cookieHeader) ? cookieHeader.join(";") : cookieHeader || "";

  header.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index === -1) {
      return;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  });

  return cookies;
}

function firstHeaderValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeIp(value?: string | null) {
  return (value || "")
    .trim()
    .replace(/^::ffff:/, "")
    .replace(/^::1$/, "127.0.0.1");
}

function sanitizeToken(value?: string | null) {
  return (value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
}

function sanitizeName(value?: string | null) {
  return (value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function sanitizeReason(value?: string | null) {
  return (value || "Banned by site moderation.").trim().replace(/\s+/g, " ").slice(0, 240);
}
