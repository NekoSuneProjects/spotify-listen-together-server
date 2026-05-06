import ClientInfo from "./clientInfo"
import config from '../config'
import SocketServer from "./socket"
import SongInfo from "./web-shared/songInfo"
import { isSpotifyContextUri, normalizeSpotifyUri } from "./spotifyUri"

export type ContextTrack = {
  uri: string;
  uid?: string | null;
  metadata?: any;
}

export default class Player {
  public trackUri = ""
  public paused = true
  public loadingTrack: NodeJS.Timeout | null = null
  public queueAdvanceTimer: NodeJS.Timeout | null = null
  public milliseconds = 0
  public locked = false
  public millisecondsLastUpdate = Date.now()
  public songInfo = new SongInfo()
  public loadAtMilliseconds = 0;
  public queue: ContextTrack[] = [];
  private lastAcceptedProgressUpdateAt = 0
  private lastDesyncResyncAt = 0
  
  constructor(
    public socketServer: SocketServer,
    private readonly onStateChanged: () => void = () => {},
  ) { }

  static isTrackListenable(trackUri: string) {
    return trackUri.startsWith("spotify:track:") || trackUri.startsWith("spotify:episode:")
  }

  static isTrackAd(trackUri: string) {
    return trackUri.startsWith("spotify:ad:")
  }

  // Returns elapsed duration in milliseconds
  getTrackProgress() {
    return this.paused ? this.milliseconds : this.milliseconds+(Date.now()-this.millisecondsLastUpdate)
  }

  /*
    Commands
  */
  updateSong(
    pause: boolean,
    milliseconds: number,
    exceptSocketId?: string,
    options: { force?: boolean } = {},
  ) {
    if (this.loadingTrack === null && Player.isTrackListenable(this.trackUri)) {
      const now = Date.now()
      const currentProgress = this.getTrackProgress()
      const pauseChanged = this.paused !== pause
      const driftMs = Math.abs(milliseconds - currentProgress)
      const shouldBroadcast =
        options.force ||
        pauseChanged ||
        driftMs >= config.progressUpdateDriftToleranceMs
      const shouldRebaseProgress =
        shouldBroadcast ||
        now - this.lastAcceptedProgressUpdateAt >= config.progressUpdateMinIntervalMs

      if (!shouldRebaseProgress) {
        return true
      }

      this.paused = pause
      this.milliseconds = milliseconds
      this.millisecondsLastUpdate = now
      this.lastAcceptedProgressUpdateAt = now

      if (shouldBroadcast) {
        this.socketServer.emitToListeners("updateSong", [this.paused, milliseconds], exceptSocketId)
        this.updateSongInfo(undefined, { force: true })
      }

      this.scheduleQueueAdvance()
      this.loadAtMilliseconds = 0;
      return true
    }
    return false
  }

  changeSong(trackUri: string, exceptSocketId?: string) {
    if (Player.isTrackListenable(trackUri)) {
      if (this.loadingTrack !== null)
        clearTimeout(this.loadingTrack)
      
      this.milliseconds = 0
      this.millisecondsLastUpdate = Date.now()
      this.lastAcceptedProgressUpdateAt = this.millisecondsLastUpdate
      this.paused = false
      this.trackUri = trackUri
      this.socketServer.emitToListeners("changeSong", [trackUri], exceptSocketId)
      this.notifyStateChanged()
      this.clearQueueAdvanceTimer()
      this.loadingTrack = setTimeout(() => {
        if (config.debugPlayback) {
          console.log("Timed out for loading track!")
        }
        this.trackLoaded()
      }, config.maxDelay)
    }
  }

  getQueue() {
    return this.queue;
  }

  hasHost() {
    return this.socketServer.getHost() !== null
  }

  isHostlessQueueMode() {
    return !this.hasHost() && !this.locked
  }

  isPlaybackController(info?: ClientInfo) {
    const leader = this.socketServer.getPlaybackLeader()
    return !!info && !!leader && leader.socket.id === info.socket.id
  }

  clearQueueAdvanceTimer() {
    if (this.queueAdvanceTimer) {
      clearTimeout(this.queueAdvanceTimer)
      this.queueAdvanceTimer = null
    }
  }

  scheduleQueueAdvance() {
    this.clearQueueAdvanceTimer()

    if (!this.isHostlessQueueMode() || this.paused || !this.trackUri) {
      return
    }

    const durationMs = this.songInfo.durationMs || 0
    if (durationMs <= 0) {
      return
    }

    const remainingMs = Math.max(durationMs - this.getTrackProgress(), 0)
    this.queueAdvanceTimer = setTimeout(() => {
      this.queueAdvanceTimer = null

      if (!this.isHostlessQueueMode()) {
        return
      }

      if (!this.playNextQueuedTrack()) {
        const fallbackUri = normalizeSpotifyUri(config.fallbackPlaylistUri)
        if (fallbackUri) {
          this.socketServer.emitToPlaybackLeader('adminPlayFallback', fallbackUri)
          return
        }

        this.paused = true
        this.milliseconds = durationMs
        this.millisecondsLastUpdate = Date.now()
        this.updateSongInfo()
      }
    }, remainingMs + 750)
  }

  playNextQueuedTrack() {
    if (!this.isHostlessQueueMode() || this.queue.length === 0) {
      return false
    }

    const nextTrack = this.queue.shift()
    if (!nextTrack) {
      return false
    }

    const nextUri = normalizeSpotifyUri(nextTrack.uri)
    this.socketServer.emitToAll('removeFromQueue', [nextTrack])
    this.notifyStateChanged()

    if (Player.isTrackListenable(nextUri)) {
      this.changeSong(nextUri)
      return true
    }

    if (isSpotifyContextUri(nextUri)) {
      this.socketServer.emitToPlaybackLeader('adminPlayFallback', nextUri)
      return true
    }

    return true
  }

  addToQueue(tracks: ContextTrack[]) {
    this.queue.push(...tracks);
    this.socketServer.emitToAll('addToQueue', [...tracks]);
    this.notifyStateChanged()

    if (this.isHostlessQueueMode() && !this.trackUri && this.socketServer.getListeners().length > 0) {
      this.playNextQueuedTrack()
    }
  }

  removeFromQueue(tracks: ContextTrack[]) {
    const removedTracks: ContextTrack[] = [];

    for (const trackToRemove of tracks) {
      const index = this.queue.findIndex(track => track.uri === trackToRemove.uri);
      if (index !== -1) {
        removedTracks.push(this.queue.splice(index, 1)[0]);
      }
    }

    if (removedTracks.length > 0) {
      this.socketServer.emitToAll('removeFromQueue', removedTracks);
      this.notifyStateChanged()
    }
  }
  
  clearQueue() {
    this.queue = [];
    this.socketServer.emitToAll('clearQueue');
    this.clearQueueAdvanceTimer()
    this.notifyStateChanged()
  }

  shiftQueueTrack(trackUri: string) {
    const nextTrack = this.queue[0]

    if (nextTrack?.uri === trackUri) {
      this.queue.shift()
      this.socketServer.emitToAll('removeFromQueue', [nextTrack])
      this.notifyStateChanged()
    }
  }

  getProgressSnapshot() {
    const progressMs = this.getTrackProgress()
    const durationMs = this.songInfo.durationMs || 0
    const remainingMs = Math.max(durationMs - progressMs, 0)

    return {
      progressMs,
      durationMs,
      remainingMs,
      endsAt: durationMs > 0 && !this.paused ? new Date(Date.now() + remainingMs).toISOString() : null
    }
  }

  getSongSnapshot() {
    return {
      ...this.songInfo,
      trackUri: this.trackUri,
      paused: this.paused,
      locked: this.locked,
      loading: this.loadingTrack !== null,
      ...this.getProgressSnapshot(),
    }
  }

  /*
    Requests
  */
  requestUpdateSong(info: ClientInfo | undefined, pause: boolean, milliseconds: number) {
    if (info === undefined || this.isPlaybackController(info)) {
      if (this.locked) {
        info?.socket.emit("bottomMessage", "Listen together is currently locked!", true)
      } else {
        this.updateSong(pause, milliseconds, info?.socket.id)
      }
    }
  }

  /*
    Updates
  */
  listenerLoadingSong(info: ClientInfo, newTrackUri: string) {
    if (this.isPlaybackController(info) && newTrackUri !== this.trackUri) {
      if (this.locked) {
        info.socket.emit("bottomMessage", "Listen together is currently locked!", true)
      } else {
        if (info.isHost) {
          this.shiftQueueTrack(newTrackUri)
        }
        this.changeSong(newTrackUri, info.socket.id)
      }
    }
  }

  listenerChangedSong(
    info: ClientInfo,
    newTrackUri: string,
    songInfoOrName?: Partial<SongInfo> | string,
    songImage?: string,
  ) {
    if (newTrackUri === "") {
      return;
    }

    let normalizedSongInfo: Partial<SongInfo> | undefined
    if (typeof songInfoOrName === "string") {
      normalizedSongInfo = {
        name: songInfoOrName,
        image: songImage,
      }
    } else {
      normalizedSongInfo = songInfoOrName
    }

    info.trackUri = newTrackUri
    if (this.isPlaybackController(info)) {
      this.updateSongInfo(normalizedSongInfo)
    }
    this.checkListenerHasAD()
    if (!this.locked) {
      if (this.loadingTrack !== null) {
        this.checkTrackLoaded()
      } else {
        this.checkDesynchronizedListeners()
      }
    }
  }

  listenerLoggedIn(info: ClientInfo) {
    this.checkListenerHasAD()
    if (!this.locked) {
      this.checkDesynchronizedListeners()
    }
  }

  listenerLoggedOut() {
    this.checkListenerHasAD()
  }

  /*
    Checks
  */
  checkTrackLoaded() {
    if (this.socketServer.getListeners().every((info) => info.trackUri === this.trackUri)) {
      if (config.debugPlayback) {
        console.log(this.loadAtMilliseconds)
      }
      this.trackLoaded()
    }
  }

  checkListenerHasAD() {
    let hasAD = this.socketServer.getListeners().some((info) => Player.isTrackAd(info.trackUri))
    this.lock(hasAD)
  }

  checkDesynchronizedListeners() {
    if (this.loadingTrack === null) {
      if (this.socketServer.getListeners().some((info) => info.trackUri !== this.trackUri)) {
        const now = Date.now()
        if (now - this.lastDesyncResyncAt < config.maxDelay) {
          return
        }

        this.lastDesyncResyncAt = now
        if (config.debugPlayback) {
          console.trace()
        }
        this.loadAtMilliseconds = this.getTrackProgress()
        this.changeSong(this.trackUri)
      }
    }
  }

  ///////////

  trackLoaded() {
    if (this.loadingTrack)
      clearTimeout(this.loadingTrack)
    this.loadingTrack = null

    let milliseconds = this.loadAtMilliseconds
    this.loadAtMilliseconds = 0
    setTimeout(() => {
      if (config.debugPlayback) {
        console.log(`====== ${milliseconds}  ${this.trackUri}`)
      }
      this.updateSong(false, milliseconds, undefined, { force: true })
    }, 1000)
  }

  lock(lock: boolean) {
    if (this.locked != lock) {
      if (config.debugPlayback) {
        console.log("LOCKING: " + lock)
      }
      this.locked = lock
      if (this.locked) {
        // this.updateSong(true, 0)
        this.clearQueueAdvanceTimer()
      } else {
        this.changeSong(this.socketServer.getHost()?.trackUri || this.trackUri)
      }
      this.socketServer.sendListeners()
      this.notifyStateChanged()
    }
  }
  
  onRequestSongInfo(info: ClientInfo) {
    info.socket.emit("songInfo", this.getSongSnapshot())
  }

  onRequestQueue(info: ClientInfo) {
    info.socket.emit('queueUpdate', this.queue);
  }

  onNoListeners() {
    this.clearQueueAdvanceTimer()
    this.trackUri = ""
    this.paused = true
    this.milliseconds = 0
    this.songInfo = new SongInfo()
    this.updateSongInfo(undefined, { force: true })
  }
  
  updateSongInfo(newSongInfo?: Partial<SongInfo>, options: { force?: boolean } = {}) {
    let changed = false

    if (newSongInfo?.name != undefined && this.songInfo.name !== newSongInfo.name) {
      this.songInfo.name = newSongInfo.name
      changed = true
    }

    if (newSongInfo?.image != undefined) {
      let image = ""
      if (newSongInfo.image.startsWith("http"))
        image = newSongInfo.image
      else if ((newSongInfo.image.match(/:/g) || []).length === 2)
        image = "https://i.scdn.co/image/" + newSongInfo.image.split(":")[2]

      if (this.songInfo.image !== image) {
        this.songInfo.image = image
        changed = true
      }
    }

    if (newSongInfo?.artistName != undefined && this.songInfo.artistName !== newSongInfo.artistName) {
      this.songInfo.artistName = newSongInfo.artistName
      changed = true
    }

    if (newSongInfo?.artists != undefined && !areStringArraysEqual(this.songInfo.artists, newSongInfo.artists)) {
      this.songInfo.artists = newSongInfo.artists
      changed = true
    }

    if (newSongInfo?.albumName != undefined && this.songInfo.albumName !== newSongInfo.albumName) {
      this.songInfo.albumName = newSongInfo.albumName
      changed = true
    }

    if (newSongInfo?.durationMs != undefined && this.songInfo.durationMs !== newSongInfo.durationMs) {
      this.songInfo.durationMs = newSongInfo.durationMs
      changed = true
    }

    if (this.songInfo.trackUri !== this.trackUri) {
      this.songInfo.trackUri = this.trackUri
      changed = true
    }

    if (this.songInfo.paused !== this.paused) {
      this.songInfo.paused = this.paused
      changed = true
    }

    if (!changed && !options.force) {
      return false
    }

    this.socketServer.emitToNonListeners("songInfo", this.getSongSnapshot())
    this.scheduleQueueAdvance()
    this.notifyStateChanged()
    return true
  }

  private notifyStateChanged() {
    this.onStateChanged()
  }
}

function areStringArraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false
  }

  return a.every((value, index) => value === b[index])
}
