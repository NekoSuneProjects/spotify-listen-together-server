import { Server, Socket } from "socket.io";
import { randomBytes } from "crypto";
import Player, { ContextTrack } from "./player";
import SocketServer, { SessionSocketUpdate } from "./socket";
import { normalizeSpotifyUri } from "./spotifyUri";
import config from "../config";
import BanManager, {
  BanIdentity,
  getClientIpFromSocket,
  getVisitorIdFromSocket,
} from "./banManager";
import ClientInfo from "./clientInfo";

export const EMPTY_SESSION_TTL_MS = 5 * 60 * 1000;

export type CreateSessionOptions = {
  id?: string;
  name?: string;
  isPublic?: boolean;
  hostPassword?: string;
}

export type SerializedSession = {
  id: string;
  name: string;
  isPublic: boolean;
  visibility: "public" | "private";
  url: string;
  createdAt: string;
  updatedAt: string;
  emptySince: string | null;
  expiresAt: string | null;
  listenerCount: number;
  queueCount: number;
  host: {
    name: string;
    trackUri: string;
  } | null;
  song: {
    trackUri: string;
    name: string;
    image: string;
    artistName: string;
    albumName: string;
    paused: boolean;
    locked: boolean;
  };
}

export class ListenSession {
  public readonly socketServer: SocketServer;
  public readonly player: Player;
  public readonly createdAt = Date.now();
  public updatedAt = Date.now();
  public emptySince: number | null = Date.now();
  public cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    public readonly id: string,
    public name: string,
    public isPublic: boolean,
    public readonly hostPassword: string,
    private readonly banManager: BanManager,
    private readonly onActivity: (session: ListenSession) => void,
    private readonly onEmpty: (session: ListenSession) => void,
    private readonly onUpdated: (session: ListenSession) => void,
  ) {
    this.socketServer = new SocketServer(
      id,
      () => this.summary(),
      () => this.markActive(),
      () => this.markEmpty(),
      (password) => this.validateHostPassword(password),
      (info) => this.banManager.findForIdentity({
        ipAddress: info.ipAddress,
        visitorId: info.visitorId,
        name: info.name,
      }),
      (_info, update) => this.update(update),
    );
    this.player = new Player(this.socketServer);
  }

  attachSocket(socket: Socket, ipAddress = "", visitorId = "") {
    this.socketServer.attachSocket(socket, this.player, ipAddress, visitorId);
  }

  validateHostPassword(password: string) {
    return password === this.hostPassword || password === config.hostPassword;
  }

  markActive() {
    this.updatedAt = Date.now();
    this.emptySince = null;
    this.onActivity(this);
  }

  markEmpty() {
    if (this.socketServer.getListeners().length > 0) {
      return;
    }

    this.updatedAt = Date.now();
    this.emptySince = Date.now();
    this.onEmpty(this);
  }

  update(update: SessionSocketUpdate) {
    if (typeof update.name === "string" && update.name.trim()) {
      this.name = sanitizeSessionName(update.name);
    }

    if (typeof update.isPublic === "boolean") {
      this.isPublic = update.isPublic;
    }

    this.updatedAt = Date.now();
    this.onUpdated(this);
    return this.summary();
  }

  summary(origin = "") {
    return {
      id: this.id,
      name: this.name,
      isPublic: this.isPublic,
      url: buildSessionUrl(this.id, origin),
    };
  }

  serialize(origin = ""): SerializedSession {
    const host = this.socketServer.getHost();
    const expiresAt = this.emptySince !== null
      ? new Date(this.emptySince + EMPTY_SESSION_TTL_MS).toISOString()
      : null;

    return {
      ...this.summary(origin),
      visibility: this.isPublic ? "public" : "private",
      createdAt: new Date(this.createdAt).toISOString(),
      updatedAt: new Date(this.updatedAt).toISOString(),
      emptySince: this.emptySince !== null ? new Date(this.emptySince).toISOString() : null,
      expiresAt,
      listenerCount: this.socketServer.getListeners().length,
      queueCount: this.player.getQueue().length,
      host: host ? {
        name: host.name,
        trackUri: host.trackUri,
      } : null,
      song: {
        trackUri: this.player.trackUri,
        name: this.player.songInfo.name,
        image: this.player.songInfo.image,
        artistName: this.player.songInfo.artistName,
        albumName: this.player.songInfo.albumName,
        paused: this.player.paused,
        locked: this.player.locked,
      },
    };
  }

  serializeForAdmin(origin = "") {
    return {
      ...this.serialize(origin),
      hostPassword: this.hostPassword,
      listeners: this.socketServer.getListeners().map((info) => serializeClientInfo(info)),
    };
  }

  destroy() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.player.clearQueueAdvanceTimer();
    if (this.player.loadingTrack) {
      clearTimeout(this.player.loadingTrack);
      this.player.loadingTrack = null;
    }

    this.socketServer.emitToAll("sessionDeleted", this.id);
    [...this.socketServer.clientsInfo.values()].forEach((info) => {
      info.socket.disconnect(true);
    });
    this.socketServer.clientsInfo.clear();
  }
}

export default class SessionManager {
  private sessions = new Map<string, ListenSession>();
  private readonly defaultSessionId = "main";

  constructor(
    private readonly io: Server,
    private readonly banManager: BanManager,
  ) {
    this.io.on("connection", (socket) => {
      this.attachSocket(socket);
    });
  }

  createSession(options: CreateSessionOptions = {}) {
    const requestedId = options.id ? sanitizeSessionId(options.id) : "";
    let id = requestedId || createSessionId();

    while (this.sessions.has(id)) {
      id = createSessionId();
    }

    const session = new ListenSession(
      id,
      sanitizeSessionName(options.name || "Listen Together Session"),
      options.isPublic !== false,
      sanitizeHostPassword(options.hostPassword) || createHostPassword(),
      this.banManager,
      (nextSession) => this.markSessionActive(nextSession),
      (nextSession) => this.scheduleEmptyCleanup(nextSession),
      () => this.emitSessionsUpdated(),
    );

    this.sessions.set(id, session);
    this.scheduleEmptyCleanup(session);
    this.emitSessionsUpdated();
    return session;
  }

  ensureDefaultSession() {
    return this.sessions.get(this.defaultSessionId) || this.createSession({
      id: this.defaultSessionId,
      name: "Main Session",
      isPublic: true,
    });
  }

  getSession(id?: string | null) {
    if (!id) {
      return null;
    }

    return this.sessions.get(sanitizeSessionId(id)) || null;
  }

  getDefaultOrFirstSession() {
    return this.sessions.get(this.defaultSessionId) || [...this.sessions.values()][0] || null;
  }

  resolveApiSession(id?: string | null) {
    if (id) {
      return this.getSession(id);
    }

    return this.getDefaultOrFirstSession() || this.ensureDefaultSession();
  }

  listSessions(options: { includePrivate?: boolean; origin?: string } = {}) {
    return [...this.sessions.values()]
      .filter((session) => options.includePrivate || session.isPublic)
      .map((session) => session.serialize(options.origin))
      .sort((a, b) => {
        if (b.listenerCount !== a.listenerCount) {
          return b.listenerCount - a.listenerCount;
        }

        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
  }

  serializeState(session: ListenSession, origin = "") {
    const host = session.socketServer.getHost();
    const listeners = session.socketServer.getListeners();
    const progress = session.player.getProgressSnapshot();

    return {
      serverTime: new Date().toISOString(),
      session: session.serialize(origin),
      host: host ? {
        name: host.name,
        trackUri: host.trackUri,
      } : null,
      song: {
        trackUri: session.player.trackUri,
        name: session.player.songInfo.name,
        image: session.player.songInfo.image,
        artistName: session.player.songInfo.artistName,
        artists: session.player.songInfo.artists,
        albumName: session.player.songInfo.albumName,
        paused: session.player.paused,
        locked: session.player.locked,
        loading: session.player.loadingTrack !== null,
        ...progress
      },
      listeners: listeners.map((info) => ({
        name: info.name,
        isHost: info.isHost,
        loggedIn: info.loggedIn,
        latency: info.latency,
        trackUri: info.trackUri
      })),
      queue: session.player.getQueue()
    };
  }

  addRequestToSession(
    session: ListenSession,
    track: ContextTrack,
    requestedBy = "API",
  ) {
    const normalizedTrack = {
      ...track,
      uri: normalizeSpotifyUri(track.uri),
      metadata: {
        ...(track.metadata || {}),
        requested_by: requestedBy,
      },
    };
    const trackName =
      normalizedTrack.metadata?.title ||
      normalizedTrack.metadata?.name ||
      normalizedTrack.uri;
    const host = session.socketServer.getHost();

    if (host) {
      host.socket.emit("songRequested", normalizedTrack.uri, trackName, requestedBy);
      return {
        accepted: true,
        hostNotified: true,
        queued: false,
        queueCount: session.player.getQueue().length,
      };
    }

    session.player.addToQueue([normalizedTrack]);
    return {
      accepted: true,
      hostNotified: false,
      queued: true,
      queueCount: session.player.getQueue().length,
    };
  }

  deleteSession(id: string) {
    const session = this.getSession(id);
    if (!session) {
      return false;
    }

    session.destroy();
    this.sessions.delete(session.id);
    this.emitSessionsUpdated();
    return true;
  }

  getAdminState(origin = "") {
    return {
      sessions: [...this.sessions.values()].map((session) => session.serializeForAdmin(origin)),
    };
  }

  findClient(socketId: string) {
    for (const session of this.sessions.values()) {
      const info = session.socketServer.clientsInfo.get(socketId);
      if (info) {
        return { session, info };
      }
    }

    return null;
  }

  disconnectMatchingClients(matcher: (identity: BanIdentity, info: ClientInfo) => boolean) {
    for (const session of this.sessions.values()) {
      for (const info of session.socketServer.clientsInfo.values()) {
        const identity = {
          ipAddress: info.ipAddress,
          visitorId: info.visitorId,
          name: info.name,
        };

        if (matcher(identity, info)) {
          info.socket.emit("banned", { reason: "Banned by site moderation." });
          info.socket.disconnect(true);
        }
      }
    }
  }

  private attachSocket(socket: Socket) {
    const ipAddress = getClientIpFromSocket(socket);
    const visitorId = getVisitorIdFromSocket(socket);
    const ban = this.banManager.findForIdentity({ ipAddress, visitorId });
    if (ban) {
      socket.emit("banned", ban);
      socket.emit("windowMessage", `You are banned from this Listen Together server. Reason: ${ban.reason}`);
      socket.disconnect(true);
      return;
    }

    const requestedSessionId = readSocketSessionId(socket);
    const session = requestedSessionId
      ? this.getSession(requestedSessionId)
      : this.ensureDefaultSession();

    if (!session) {
      socket.emit("windowMessage", "That Listen Together session no longer exists.");
      socket.disconnect(true);
      return;
    }

    session.attachSocket(socket, ipAddress, visitorId);
  }

  private markSessionActive(session: ListenSession) {
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = null;
    }
    this.emitSessionsUpdated();
  }

  private scheduleEmptyCleanup(session: ListenSession) {
    if (session.socketServer.getListeners().length > 0) {
      return;
    }

    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
    }

    if (session.emptySince === null) {
      session.emptySince = Date.now();
    }

    const deleteIn = Math.max(session.emptySince + EMPTY_SESSION_TTL_MS - Date.now(), 0);
    session.cleanupTimer = setTimeout(() => {
      if (session.socketServer.getListeners().length === 0) {
        this.deleteSession(session.id);
      }
    }, deleteIn);
    this.emitSessionsUpdated();
  }

  private emitSessionsUpdated() {
    this.io.emit("sessionsUpdated", this.listSessions({ includePrivate: false }));
  }
}

export function buildSessionUrl(sessionId: string, origin = "") {
  const path = `/session/${encodeURIComponent(sessionId)}`;
  return origin ? `${origin}${path}` : path;
}

export function getOrigin(req: { protocol: string; get(name: string): string | undefined }) {
  return `${req.protocol}://${req.get("host") || ""}`;
}

function readSocketSessionId(socket: Socket) {
  const value =
    socket.handshake.auth?.sessionId ||
    socket.handshake.query.sessionId ||
    socket.handshake.query.session;

  return typeof value === "string" && value.trim() ? value : "";
}

function createSessionId() {
  return randomBytes(6).toString("hex");
}

function createHostPassword() {
  return randomBytes(6).toString("base64url");
}

function sanitizeSessionId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function sanitizeSessionName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80) || "Listen Together Session";
}

function sanitizeHostPassword(value?: string | null) {
  return (value || "").trim().slice(0, 128);
}

function serializeClientInfo(info: ClientInfo) {
  return {
    socketId: info.socket.id,
    name: info.name,
    isHost: info.isHost,
    loggedIn: info.loggedIn,
    latency: info.latency,
    trackUri: info.trackUri,
    ipAddress: info.ipAddress,
    visitorId: info.visitorId,
  };
}
