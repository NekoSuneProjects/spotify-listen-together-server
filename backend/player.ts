import ClientInfo from "./clientInfo"
import config from '../config'
import SocketServer from "./socket"
import SongInfo from "./web-shared/songInfo"

export type ContextTrack = {
  uri: string;
  uid?: string | null;
  metadata?: any;
}

export default class Player {
  public trackUri = ""
  public paused = true
  public loadingTrack: NodeJS.Timeout | null = null
  public milliseconds = 0
  public locked = false
  public millisecondsLastUpdate = Date.now()
  public songInfo = new SongInfo()
  public loadAtMilliseconds = 0;
  public queue: ContextTrack[] = [];
  
  constructor(public socketServer: SocketServer) { }

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
  updateSong(pause: boolean, milliseconds: number, exceptSocketId?: string) {
    if (this.loadingTrack === null && Player.isTrackListenable(this.trackUri)) {
      this.paused = pause
      this.milliseconds = milliseconds
      this.millisecondsLastUpdate = Date.now()
      this.socketServer.emitToListeners("updateSong", [this.paused, milliseconds], exceptSocketId)
      this.updateSongInfo()
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
      this.paused = false
      this.trackUri = trackUri
      this.songInfo.trackUri = trackUri
      this.socketServer.emitToListeners("changeSong", [trackUri], exceptSocketId)
      this.loadingTrack = setTimeout(() => {
        console.log("Timed out for loading track!")
        this.trackLoaded()
      }, config.maxDelay)
    }
  }

  getQueue() {
    return this.queue;
  }

  addToQueue(tracks: ContextTrack[]) {
    this.queue.push(...tracks);
    this.socketServer.emitToListeners('addToQueue', [[...tracks]]);
  }

  removeFromQueue(tracks: ContextTrack[]) {
    const removedTracks: ContextTrack[] = [];

    for (const trackToRemove of tracks) {
      const index = this.queue.findIndex(track => track.uri === trackToRemove.uri);
      if (index !== -1) {
        removedTracks.push(this.queue.splice(index, 1)[0]);
      }
    }

    this.socketServer.emitToListeners('removeFromQueue', [removedTracks]);
  }
  
  clearQueue() {
    this.queue = [];
    this.socketServer.emitToListeners('clearQueue');
  }

  shiftQueueTrack(trackUri: string) {
    const nextTrack = this.queue[0]

    if (nextTrack?.uri === trackUri) {
      this.queue.shift()
      this.socketServer.emitToListeners('removeFromQueue', [[nextTrack]])
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

  /*
    Requests
  */
  requestUpdateSong(info: ClientInfo | undefined, pause: boolean, milliseconds: number) {
    if (info === undefined || info?.isHost) {
      if (this.locked) {
        info?.socket.emit("bottomMessage", "Listen together is currently locked!", true)
      } else {
        this.updateSong(pause, milliseconds, info?.isHost ? info.socket.id : undefined)
      }
    }
  }

  /*
    Updates
  */
  listenerLoadingSong(info: ClientInfo, newTrackUri: string) {
    if (info.isHost && newTrackUri !== this.trackUri) {
      if (this.locked) {
        info.socket.emit("bottomMessage", "Listen together is currently locked!", true)
      } else {
        this.shiftQueueTrack(newTrackUri)
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
    if (info.isHost) {
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
      console.log(this.loadAtMilliseconds)
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
        console.trace()
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
      console.log(`====== ${milliseconds}  ${this.trackUri}`)
      this.requestUpdateSong(undefined, false, milliseconds)
    }, 1000)
  }

  lock(lock: boolean) {
    console.log("LOCKING: " + lock)
    if (this.locked != lock) {
      this.locked = lock
      if (this.locked) {
        // this.updateSong(true, 0)
      } else {
        this.changeSong(this.socketServer.getHost()?.trackUri || this.trackUri)
      }
      this.socketServer.sendListeners()
    }
  }
  
  onRequestSongInfo(info: ClientInfo) {
    info.socket.emit("songInfo", this.songInfo)
  }

  onRequestQueue(info: ClientInfo) {
    info.socket.emit('queueUpdate', this.queue);
  }

  onNoListeners() {
    this.trackUri = ""
    this.paused = true
    this.milliseconds = 0
    this.songInfo = new SongInfo()
    this.updateSongInfo()
  }
  
  updateSongInfo(newSongInfo?: Partial<SongInfo>) {
    if (newSongInfo?.name != undefined)
      this.songInfo.name = newSongInfo.name

    if (newSongInfo?.image != undefined) {
      if (newSongInfo.image.startsWith("http"))
        this.songInfo.image = newSongInfo.image
      else if ((newSongInfo.image.match(/:/g) || []).length === 2)
        this.songInfo.image = "https://i.scdn.co/image/" + newSongInfo.image.split(":")[2]
      else
        this.songInfo.image = ""
    }

    if (newSongInfo?.artistName != undefined)
      this.songInfo.artistName = newSongInfo.artistName

    if (newSongInfo?.artists != undefined)
      this.songInfo.artists = newSongInfo.artists

    if (newSongInfo?.albumName != undefined)
      this.songInfo.albumName = newSongInfo.albumName

    if (newSongInfo?.durationMs != undefined)
      this.songInfo.durationMs = newSongInfo.durationMs

    this.songInfo.trackUri = this.trackUri
    this.songInfo.paused = this.paused
    this.socketServer.emitToNonListeners("songInfo", this.songInfo)
  }
}
