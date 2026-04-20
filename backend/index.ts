import express from 'express'
import next from 'next'
import http from 'http'
import { Server } from 'socket.io'
import path from 'path'
import dotenv from 'dotenv'

express()

dotenv.config()

function readIntEnv(name: string, fallback: number) {
  const value = process.env[name]

  if (!value) {
    return fallback
  }

  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const port = readIntEnv('PORT', 3000)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  const { default: config } = await import('../config')
  const { default: Backend } = await import('./backend')
  const server = express()
  const httpServer = http.createServer(server)
  const io = new Server(httpServer, {
    cors: {
      origin: '*'
    },
    pingInterval: 1000
  })

  // Sorry I don't know another way
  let publicFolder = __dirname
  let distPos = publicFolder.lastIndexOf("dist");
  if (distPos != -1)
    publicFolder = path.join(publicFolder.substring(0, distPos), '/public/');

  console.log(publicFolder)

  server.use(express.json())
  server.use(express.static(publicFolder))

  const backend = new Backend(io)

  const getAdminApiKey = (req: express.Request) => {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice('Bearer '.length).trim()
      : ''

    const headerKey = typeof req.headers['x-api-key'] === 'string'
      ? req.headers['x-api-key']
      : ''

    return headerKey || bearer
  }

  const requireAdminApiKey = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (!config.apiKey) {
      res.status(503).json({ error: 'API_KEY is not configured on the server.' })
      return
    }

    if (getAdminApiKey(req) !== config.apiKey) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    next()
  }

  const serializeState = () => {
    const host = backend.socketServer.getHost()
    const listeners = backend.socketServer.getListeners()
    const progress = backend.player.getProgressSnapshot()

    return {
      serverTime: new Date().toISOString(),
      host: host ? {
        name: host.name,
        trackUri: host.trackUri
      } : null,
      song: {
        trackUri: backend.player.trackUri,
        name: backend.player.songInfo.name,
        image: backend.player.songInfo.image,
        artistName: backend.player.songInfo.artistName,
        artists: backend.player.songInfo.artists,
        albumName: backend.player.songInfo.albumName,
        paused: backend.player.paused,
        locked: backend.player.locked,
        loading: backend.player.loadingTrack !== null,
        ...progress
      },
      listeners: listeners.map((info) => ({
        name: info.name,
        isHost: info.isHost,
        loggedIn: info.loggedIn,
        latency: info.latency,
        trackUri: info.trackUri
      })),
      queue: backend.player.getQueue(),
      fallbackPlaylistUri: config.fallbackPlaylistUri || null
    }
  }

  server.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  server.get('/api/song', (_req, res) => {
    res.json(serializeState().song)
  })

  server.get('/api/listeners', (_req, res) => {
    res.json({
      count: backend.socketServer.getListeners().length,
      listeners: backend.socketServer.getListeners().map((info) => ({
        name: info.name,
        isHost: info.isHost,
        loggedIn: info.loggedIn,
        latency: info.latency,
        trackUri: info.trackUri
      }))
    })
  })

  server.get('/api/queue', (_req, res) => {
    res.json({
      count: backend.player.queue.length,
      queue: backend.player.getQueue()
    })
  })

  server.get('/api/state', (_req, res) => {
    res.json(serializeState())
  })

  server.post('/api/admin/queue', requireAdminApiKey, (req, res) => {
    const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : []
    const playNow = req.body?.playNow === true

    if (tracks.length === 0) {
      res.status(400).json({ error: 'Body must include a non-empty tracks array.' })
      return
    }

    backend.player.addToQueue(tracks)

    if (playNow) {
      if (backend.player.trackUri) {
        backend.socketServer.emitToHost('adminSkipToNext')
      } else {
        backend.socketServer.emitToHost('adminPlayTrack', tracks[0].uri)
      }
    }

    res.json({
      ok: true,
      queueCount: backend.player.getQueue().length,
      queue: backend.player.getQueue()
    })
  })

  server.post('/api/admin/queue/clear', requireAdminApiKey, (_req, res) => {
    backend.player.clearQueue()
    res.json({ ok: true })
  })

  server.post('/api/admin/fallback/play', requireAdminApiKey, (_req, res) => {
    if (!config.fallbackPlaylistUri) {
      res.status(400).json({ error: 'FALLBACK_PLAYLIST_URI is not configured.' })
      return
    }

    backend.socketServer.emitToHost('adminPlayFallback', config.fallbackPlaylistUri)
    res.json({ ok: true, fallbackPlaylistUri: config.fallbackPlaylistUri })
  })

  server.all('*', (req, res) => {
    return handle(req, res)
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
