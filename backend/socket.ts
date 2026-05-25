import { Socket } from "socket.io";
import ClientInfo from "./clientInfo";
import config from "../config";
import ClientVersionValidator from './clientVersionValidator';
import Player, { ContextTrack } from "./player";
import type { BanMatch } from "./banManager";
import { normalizeSpotifyUri } from "./spotifyUri";

export type SessionSocketUpdate = {
  name?: string;
  isPublic?: boolean;
}

export type SessionSocketSummary = {
  id: string;
  name: string;
  isPublic: boolean;
  url: string;
}

type SessionUpdateHandler = (
  info: ClientInfo,
  update: SessionSocketUpdate,
) => SessionSocketSummary | null;

type HostPasswordValidator = (password: string) => boolean;
type ClientBanChecker = (info: ClientInfo) => BanMatch | null;

export default class SocketServer {
  clientsInfo = new Map<string, ClientInfo>()
  private player: Player | undefined
  private clientVersionValidator = new ClientVersionValidator()

  constructor (
    public readonly sessionId: string,
    private readonly getSessionSummary: () => SessionSocketSummary,
    private readonly onActivity: () => void,
    private readonly onEmpty: () => void,
    private readonly validateHostPassword: HostPasswordValidator,
    private readonly getClientBan?: ClientBanChecker,
    private readonly onUpdateSession?: SessionUpdateHandler,
  ) {}

  getListeners() {
    const listeners: ClientInfo[] = []

    for (const info of this.clientsInfo.values()) {
      if (info.loggedIn) {
        listeners.push(info)
      }
    }

    return listeners
  }

  getHost(): ClientInfo | null {
    for (const info of this.clientsInfo.values()) {
      if (info.isHost) {
        return info
      }
    }

    return null
  }

  getPlaybackLeader(): ClientInfo | null {
    return this.getHost() || this.getListeners()[0] || null
  }

  emitToAll(ev: string, ...args: any[]) {
    this.clientsInfo.forEach((info) => {
      info.socket.emit(ev, ...args)
    })
  }

  emitToNonListeners(ev: string, ...args: any[]) {
    for (const info of this.clientsInfo.values()) {
      if (!info.loggedIn) {
        info.socket.emit(ev, ...args)
      }
    }
  }

  emitToListeners(ev: string, args: any[] = [], exceptSocketId?: string) {
    this.getListeners().forEach(info => {
      if (exceptSocketId && info.socket.id === exceptSocketId) {
        return
      }

      info.socket.emit(ev, ...args)
    });
  }

  emitToHost(ev: string, ...args: any[]) {
    this.getHost()?.socket.emit(ev, ...args)
  }

  emitToPlaybackLeader(ev: string, ...args: any[]) {
    this.getPlaybackLeader()?.socket.emit(ev, ...args)
  }

  sendListeners(socket?: Socket) {
    const listeners = this.getListeners().map(info => {return {
      name: info.name,
      isHost: info.isHost,
      watchingAD: info.trackUri.includes("spotify:ad:"),
      trackUri: info.trackUri,
      latency: info.latency,
    }})

    if (socket) {
      socket.emit("listeners", listeners)
      return
    }

    this.emitToAll("listeners", listeners)
  }

  updateHost(info: ClientInfo, isHost: boolean) {
    info.isHost = isHost
    info.socket.emit("isHost", isHost)
    this.sendListeners()
    this.sendPlaybackLeader()
    this.onActivity()
  }

  sendPlaybackLeader() {
    const leader = this.getPlaybackLeader()
    this.getListeners().forEach((info) => {
      info.socket.emit("playbackLeader", leader?.socket.id === info.socket.id)
    })
  }

  attachSocket(socket: Socket, player: Player, ipAddress = "", visitorId = "") {
    this.player = player
    let lastPing = 0
    let info = new ClientInfo(socket, ipAddress, visitorId)
    const eventBuckets = new Map<string, { count: number; resetAt: number }>()
    this.clientsInfo.set(socket.id, info)
    socket.emit("sessionInfo", this.getSessionSummary())

    const isRateLimited = (name: string, limit = config.socketQueueEventLimit, windowMs = 60_000) => {
      const now = Date.now()
      const bucket = eventBuckets.get(name)

      if (!bucket || bucket.resetAt <= now) {
        eventBuckets.set(name, { count: 1, resetAt: now + windowMs })
        return false
      }

      bucket.count += 1
      return bucket.count > limit
    }

    const rejectQueueMutation = () => {
      socket.emit("bottomMessage", "Only the host or playback leader can change the shared queue.", true)
    }

    socket.conn.on('packet', function (packet) {
      if (packet.type === 'pong') {
        info.latency = Math.min((Date.now() - lastPing)/2, config.maxDelay)
      }
    });

    if (config.debugSocketEvents) {
      socket.onAny((ev: string, ...args: any) => {
        console.log(`Receiving ${ev}(session=${this.sessionId}, host=${info.isHost}): ${args}`)
      })
    }

    socket.conn.on('packetCreate', function (packet) {
      if (packet.type === 'ping')
        lastPing = Date.now()
    });

    socket.on("login", (name: string, clientVersion?: string, badVersion?: (requirements: string) => void) => {
      if (this.clientVersionValidator.validate(clientVersion)) {
        info.name = name

        const ban = this.getClientBan?.(info)
        if (ban) {
          socket.emit("banned", ban)
          socket.emit("windowMessage", `You are banned from this Listen Together server. Reason: ${ban.reason}`)
          setTimeout(() => socket.disconnect(true), 250)
          return
        }

        info.loggedIn = true;
        this.onActivity()
        this.player?.listenerLoggedIn(info)
        this.sendListeners()
        this.sendPlaybackLeader()
        if (config.debugSocketEvents) {
          console.log(`Sending queue to ${name}`)
        }
        socket.emit('queueUpdate', this.player?.getQueue())
        socket.emit("sessionInfo", this.getSessionSummary())
      } else {
        if (badVersion != null)
          badVersion(config.clientVersionRequirements)

        setTimeout(() => {
          socket.disconnect()
        }, 3000)
      }
    })

    socket.on("requestHost", (password: string) => {
      if (this.validateHostPassword(password)) {
        this.updateHost(info, true);
        socket.emit("bottomMessage", "Host permissions acquired.", true)
      } else {
        this.updateHost(info, false)
        socket.emit("bottomMessage", "Incorrect password.", true)
      }
    })

    socket.on("cancelHost", () => {
      this.updateHost(info, false)
    })

    socket.on("updateSession", (update: SessionSocketUpdate, callback?: (response: any) => void) => {
      if (!info.isHost) {
        callback?.({ ok: false, error: "Only the host can update the session." })
        socket.emit("bottomMessage", "Only the host can update the session.", true)
        return
      }

      const summary = this.onUpdateSession?.(info, update)
      if (!summary) {
        callback?.({ ok: false, error: "Session update failed." })
        return
      }

      this.emitToAll("sessionInfo", summary)
      this.onActivity()
      callback?.({ ok: true, session: summary })
    })

    socket.on("requestUpdateSong", (pause: boolean, milliseconds: number) => {
      this.onActivity()
      this.player?.requestUpdateSong(info, pause, milliseconds)
    })

    socket.on("requestSongInfo", () => {
      this.player?.onRequestSongInfo(info)
      socket.emit("sessionInfo", this.getSessionSummary())
    })

    socket.on("loadingSong", (trackUri: string) => {
      this.onActivity()
      this.player?.listenerLoadingSong(info, trackUri)
    })

    socket.on("changedSong", (trackUri: string, songInfoOrName?: any, songImage?: string) => {
      this.onActivity()
      this.player?.listenerChangedSong(info, trackUri, songInfoOrName, songImage)
    })

    socket.on("requestListeners", () => {
      this.sendListeners(socket)
    })

    socket.on("requestSong", (trackUri: string, trackName: string, metadata?: any) => {
      const host = this.getHost()
      this.onActivity()
      if (isRateLimited("requestSong")) {
        socket.emit("bottomMessage", "You are sending requests too quickly.", true)
        return
      }

      const normalizedTrackUri = normalizeSpotifyUri(trackUri)
      if (!Player.isTrackListenable(normalizedTrackUri)) {
        socket.emit("bottomMessage", "Only Spotify tracks and episodes can be requested.", true)
        return
      }

      const safeTrackName = typeof trackName === "string" && trackName.trim()
        ? trackName.trim().slice(0, 200)
        : normalizedTrackUri

      if (host) {
        host.socket.emit("songRequested", normalizedTrackUri, safeTrackName, info.name)
        socket.emit("bottomMessage", `Sent "${safeTrackName}" to the host.`, true)
        return
      }

      const queued = this.player?.addToQueue([{
        uri: normalizedTrackUri,
        metadata: {
          title: safeTrackName,
          artist_name: metadata?.artist_name || metadata?.artistName || "",
          album_title: metadata?.album_title || metadata?.albumName || "",
          image_url: metadata?.image_url || metadata?.image || "",
          requested_by: info.name,
        }
      }])

      if (!queued) {
        socket.emit("bottomMessage", "The queue is full or the request was invalid.", true)
        return
      }

      socket.emit("bottomMessage", `Queued "${safeTrackName}".`, true)
    })

    socket.on("requestQueue", () => {
      this.player?.onRequestQueue(info);
    });

    socket.on("addToQueue", (tracks: ContextTrack[]) => {
      this.onActivity()
      if (isRateLimited("addToQueue")) {
        socket.emit("bottomMessage", "You are changing the queue too quickly.", true)
        return
      }

      if (!this.player?.canMutateQueue(info)) {
        rejectQueueMutation()
        return
      }

      if (!this.player.addToQueue(tracks)) {
        socket.emit("bottomMessage", "The queue is full or the submitted tracks were invalid.", true)
      }
    });

    socket.on("removeFromQueue", (tracks: ContextTrack[]) => {
      this.onActivity()
      if (isRateLimited("removeFromQueue")) {
        socket.emit("bottomMessage", "You are changing the queue too quickly.", true)
        return
      }

      if (!this.player?.canMutateQueue(info)) {
        rejectQueueMutation()
        return
      }

      this.player?.removeFromQueue(tracks);
    });

    socket.on("clearQueue", () => {
      this.onActivity()
      if (isRateLimited("clearQueue")) {
        socket.emit("bottomMessage", "You are changing the queue too quickly.", true)
        return
      }

      if (!this.player?.canMutateQueue(info)) {
        rejectQueueMutation()
        return
      }

      this.player?.clearQueue();
    });

    socket.on("disconnecting", () => {
      const wasLoggedIn = info.loggedIn
      this.clientsInfo.delete(socket.id)

      if (wasLoggedIn) {
        this.player?.listenerLoggedOut()
        this.sendListeners()
        this.sendPlaybackLeader()
        if (this.getListeners().length === 0) {
          this.onEmpty()
        } else {
          this.onActivity()
        }
      } else if (this.getListeners().length === 0) {
        this.onEmpty()
      }
    })
  }
}
