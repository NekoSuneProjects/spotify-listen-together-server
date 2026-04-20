import { Server, Socket } from "socket.io";
import ClientInfo from "./clientInfo";
import config from "../config";
import ClientVersionValidator from './clientVersionValidator';
import Player, { ContextTrack } from "./player";

export default class SocketServer {
  clientsInfo = new Map<string, ClientInfo>()
  private player: Player | undefined
  private clientVersionValidator = new ClientVersionValidator()

  constructor (private io: Server) {}

  getListeners() {
    return [...this.clientsInfo.values()].filter((info: ClientInfo) => info.loggedIn)
  }

  getHost(): ClientInfo | null {
    return [...this.clientsInfo.values()].find((info) => info.isHost) || null
  }

  getPlaybackLeader(): ClientInfo | null {
    return this.getHost() || this.getListeners()[0] || null
  }

  emitToNonListeners(ev: string, ...args: any) {
    [...this.clientsInfo.values()].filter((info: ClientInfo) => !info.loggedIn).forEach(info => {
      info.socket.emit(ev, ...args)
    })
  }

  emitToListeners(ev: string, args: any[] = [], exceptSocketId?: string) {
    let listeners = this.getListeners()
    let maxLatency = 0
    let minLatency = config.maxDelay
    listeners.forEach(info => {
      // console.log(`Latency for ${info.name} is ${info.latency}`)
      maxLatency = Math.max(info.latency, maxLatency)
      minLatency = Math.min(info.latency, minLatency)
    })
    listeners.forEach(info => {
      if (exceptSocketId && info.socket.id === exceptSocketId) {
        return
      }

      let delay = ((maxLatency - minLatency) - (info.latency - minLatency))
      // console.log(`Sending to ${socketId} with ${delay} ms delay.`)
      setTimeout(() => {
        info.socket.emit(ev, ...args) 
      }, delay)
    });
  }

  emitToHost(ev: string, ...args: any[]) {
    this.getHost()?.socket.emit(ev, ...args)
  }

  emitToPlaybackLeader(ev: string, ...args: any[]) {
    this.getPlaybackLeader()?.socket.emit(ev, ...args)
  }

  sendListeners(socket?: Socket) {
    if (!socket) 
      socket = <any>this.io

    socket?.emit("listeners", this.getListeners().map(info => {return {
      name: info.name,
      isHost: info.isHost,
      watchingAD: info.trackUri.includes("spotify:ad:")
    }}))
  }

  updateHost(info: ClientInfo, isHost: boolean) {
    info.isHost = isHost
    info.socket.emit("isHost", isHost)
    this.sendListeners()
    this.sendPlaybackLeader()
  }

  sendPlaybackLeader() {
    const leader = this.getPlaybackLeader()
    this.getListeners().forEach((info) => {
      info.socket.emit("playbackLeader", leader?.socket.id === info.socket.id)
    })
  }

  addEvents(player: Player) {
    this.player = player
    this.io.on("connection", (socket: Socket) => {
      let lastPing = 0
      let info = new ClientInfo(socket)
      this.clientsInfo.set(socket.id, info)
    
      socket.conn.on('packet', function (packet) {
        if (packet.type === 'pong') {
          info.latency = Math.min((Date.now() - lastPing)/2, config.maxDelay)
        }
      });
    
      socket.onAny((ev: string, ...args: any) => {
        console.log(`Receiving ${ev}(host=${info.isHost}): ${args}`)
      })
      
      socket.conn.on('packetCreate', function (packet) {
        if (packet.type === 'ping')
          lastPing = Date.now()
      });
    
      socket.on("login", (name: string, clientVersion?: string, badVersion?: (requirements: string) => void) => {
        if (this.clientVersionValidator.validate(clientVersion)) {
          info.name = name
          info.loggedIn = true;
          this.player?.listenerLoggedIn(info)
          this.sendListeners()
          this.sendPlaybackLeader()
          console.log(`Sending queue to ${name}`)
          socket.emit('queueUpdate', this.player?.getQueue())
        } else {
          if (badVersion != null)
            badVersion(config.clientVersionRequirements)
            
          setTimeout(() => {
            socket.disconnect()
          }, 3000)
        }
      })

      socket.on("requestHost", (password: string) => {
        if (password === config.hostPassword) {
          // if ([...this.clientsInfo.values()].every((info: ClientInfo) => !info.loggedIn || !info.isHost)) {
          //   this.updateHost(info, true)
          // } else {
          //   socket.emit("bottomMessage", "There is already an host.")
          // }
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

      socket.on("requestUpdateSong", (pause: boolean, milliseconds: number) => {
        this.player?.requestUpdateSong(info, pause, milliseconds)
      })
  
      socket.on("requestSongInfo", () => {
        this.player?.onRequestSongInfo(info)
      })

      socket.on("loadingSong", (trackUri: string) => {
        this.player?.listenerLoadingSong(info, trackUri)
      })

      socket.on("changedSong", (trackUri: string, songInfoOrName?: any, songImage?: string) => {
        this.player?.listenerChangedSong(info, trackUri, songInfoOrName, songImage)
      })

      socket.on("requestListeners", () => {
        this.sendListeners(socket)
      })

      socket.on("requestSong", (trackUri: string, trackName: string, metadata?: any) => {
        const host = this.getHost()

        if (host) {
          host.socket.emit("songRequested", trackUri, trackName, info.name)
          socket.emit("bottomMessage", `Sent "${trackName}" to the host.`, true)
          return
        }

        this.player?.addToQueue([{
          uri: trackUri,
          metadata: {
            title: trackName,
            artist_name: metadata?.artist_name || metadata?.artistName || "",
            album_title: metadata?.album_title || metadata?.albumName || "",
            image_url: metadata?.image_url || metadata?.image || "",
            requested_by: info.name,
          }
        }])

        socket.emit("bottomMessage", `Queued "${trackName}".`, true)
      })

      // Queue events
      socket.on("requestQueue", () => {
        this.player?.onRequestQueue(info);
      });

      socket.on("addToQueue", (tracks: ContextTrack[]) => {
        this.player?.addToQueue(tracks);
      });

      socket.on("removeFromQueue", (tracks: ContextTrack[]) => {
        this.player?.removeFromQueue(tracks);
      });

      socket.on("clearQueue", () => {
        this.player?.clearQueue();
      });

      socket.on("disconnecting", (reason) => {
        this.clientsInfo.delete(socket.id)
        this.player?.listenerLoggedOut()
        this.sendListeners()
        this.sendPlaybackLeader()
        if (this.getListeners().length === 0) {
          this.player?.onNoListeners()
        }
      })
    })
  }
}
