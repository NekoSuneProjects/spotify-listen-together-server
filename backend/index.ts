import express from 'express'
import next from 'next'
import http from 'http'
import { Server } from 'socket.io'
import path from 'path'
import dotenv from 'dotenv'
import { normalizeSpotifyUri } from './spotifyUri'
import { ListenSession, getOrigin } from './sessionManager'
import pJson from '../package.json'

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

  let publicFolder = __dirname
  let distPos = publicFolder.lastIndexOf("dist");
  if (distPos != -1)
    publicFolder = path.join(publicFolder.substring(0, distPos), '/public/');

  console.log(publicFolder)

  server.use((req, res, nextMiddleware) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key')
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')

    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }

    nextMiddleware()
  })
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

  const hasAdminApiKey = (req: express.Request) => {
    return !!config.apiKey && getAdminApiKey(req) === config.apiKey
  }

  const requireAdminApiKey = (
    req: express.Request,
    res: express.Response,
    nextMiddleware: express.NextFunction,
  ) => {
    if (!config.apiKey) {
      res.status(503).json({ error: 'API_KEY is not configured on the server.' })
      return
    }

    if (getAdminApiKey(req) !== config.apiKey) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    nextMiddleware()
  }

  const readQuerySessionId = (req: express.Request) => {
    const value = req.query.sessionId || req.query.session
    return typeof value === 'string' ? value : ''
  }

  const readRouteParam = (value: string | string[] | undefined) => {
    return Array.isArray(value) ? value[0] : value || ''
  }

  const getSessionOr404 = (
    req: express.Request,
    res: express.Response,
    explicitSessionId?: string,
  ) => {
    const session = explicitSessionId
      ? backend.sessionManager.getSession(explicitSessionId)
      : backend.sessionManager.resolveApiSession(readQuerySessionId(req))

    if (!session) {
      res.status(404).json({ error: 'Session not found.' })
      return null
    }

    return session
  }

  const serializeState = (session: ListenSession, req: express.Request) => {
    return {
      ...backend.sessionManager.serializeState(session, getOrigin(req)),
      fallbackPlaylistUri: normalizeSpotifyUri(config.fallbackPlaylistUri) || null
    }
  }

  const readRequestTrack = (body: any) => {
    const metadata = body?.metadata || {}
    const uri = normalizeSpotifyUri(body?.uri || body?.trackUri || metadata?.uri)

    if (!uri) {
      return null
    }

    return {
      uri,
      metadata: {
        ...metadata,
        title: body?.trackName || body?.name || metadata?.title || metadata?.name || uri,
        artist_name: body?.artistName || body?.artist_name || metadata?.artist_name || metadata?.artistName || '',
        album_title: body?.albumName || body?.album_title || metadata?.album_title || metadata?.albumName || '',
        image_url: body?.image || body?.image_url || metadata?.image_url || metadata?.image || '',
      }
    }
  }

  const handleRequestSong = (
    req: express.Request,
    res: express.Response,
    session: ListenSession,
  ) => {
    const track = readRequestTrack(req.body)
    const requestedBy = req.body?.requestedBy || req.body?.twitchUser || req.body?.user || 'API'

    if (!track) {
      res.status(400).json({ error: 'Body must include uri or trackUri.' })
      return
    }

    const result = backend.sessionManager.addRequestToSession(session, track, requestedBy)
    res.json({
      ok: true,
      session: session.serialize(getOrigin(req)),
      track,
      ...result,
    })
  }

  const handleAdminQueue = (
    req: express.Request,
    res: express.Response,
    session: ListenSession,
  ) => {
    const tracks = Array.isArray(req.body?.tracks)
      ? req.body.tracks.map((track: any) => ({
          ...track,
          uri: normalizeSpotifyUri(track?.uri),
        })).filter((track: any) => !!track.uri)
      : []
    const playNow = req.body?.playNow === true
    const hasHost = session.socketServer.getHost() !== null

    if (tracks.length === 0) {
      res.status(400).json({ error: 'Body must include a non-empty tracks array.' })
      return
    }

    session.player.addToQueue(tracks)

    if (playNow && !hasHost) {
      session.player.playNextQueuedTrack()
    }

    res.json({
      ok: true,
      session: session.serialize(getOrigin(req)),
      hostControlled: hasHost,
      queueCount: session.player.getQueue().length,
      queue: session.player.getQueue()
    })
  }

  server.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  server.get('/api/version', (_req, res) => {
    res.json({
      serverVersion: pJson.version,
      pluginVersion: config.clientRecommendedVersion,
      clientRecommendedVersion: config.clientRecommendedVersion,
      clientVersionRequirements: config.clientVersionRequirements,
      updateUrl: config.clientUpdateUrl,
      checkedAt: new Date().toISOString(),
    })
  })

  server.get('/api/sessions', (req, res) => {
    res.json({
      sessions: backend.sessionManager.listSessions({
        includePrivate: false,
        origin: getOrigin(req),
      })
    })
  })

  server.post('/api/sessions', (req, res) => {
    if (req.body?.hostPassword !== config.hostPassword && !hasAdminApiKey(req)) {
      res.status(401).json({ error: 'Only a host can create sessions.' })
      return
    }

    const session = backend.sessionManager.createSession({
      name: req.body?.name,
      isPublic: req.body?.isPublic !== false,
    })

    res.status(201).json({
      ok: true,
      session: session.serialize(getOrigin(req)),
    })
  })

  server.get('/api/sessions/:sessionId', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return

    res.json({
      session: session.serialize(getOrigin(req)),
    })
  })

  server.patch('/api/sessions/:sessionId', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return

    if (req.body?.hostPassword !== config.hostPassword && !hasAdminApiKey(req)) {
      res.status(401).json({ error: 'Only the host can update this session.' })
      return
    }

    session.update({
      name: req.body?.name,
      isPublic: req.body?.isPublic,
    })

    session.socketServer.emitToAll("sessionInfo", session.summary())
    res.json({
      ok: true,
      session: session.serialize(getOrigin(req)),
    })
  })

  server.delete('/api/sessions/:sessionId', requireAdminApiKey, (req, res) => {
    res.json({
      ok: backend.sessionManager.deleteSession(readRouteParam(req.params.sessionId)),
    })
  })

  server.get('/api/song', (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    res.json(serializeState(session, req).song)
  })

  server.get('/api/nowplaying', (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    res.json(serializeState(session, req).song)
  })

  server.get('/api/listeners', (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    res.json({
      session: session.serialize(getOrigin(req)),
      count: session.socketServer.getListeners().length,
      listeners: session.socketServer.getListeners().map((info) => ({
        name: info.name,
        isHost: info.isHost,
        loggedIn: info.loggedIn,
        latency: info.latency,
        trackUri: info.trackUri
      }))
    })
  })

  server.get('/api/queue', (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    res.json({
      session: session.serialize(getOrigin(req)),
      count: session.player.queue.length,
      queue: session.player.getQueue()
    })
  })

  server.get('/api/state', (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    res.json(serializeState(session, req))
  })

  server.get('/api/sessions/:sessionId/song', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    res.json(serializeState(session, req).song)
  })

  server.get('/api/sessions/:sessionId/nowplaying', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    res.json(serializeState(session, req).song)
  })

  server.get('/api/sessions/:sessionId/listeners', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    res.json({
      session: session.serialize(getOrigin(req)),
      count: session.socketServer.getListeners().length,
      listeners: session.socketServer.getListeners().map((info) => ({
        name: info.name,
        isHost: info.isHost,
        loggedIn: info.loggedIn,
        latency: info.latency,
        trackUri: info.trackUri
      }))
    })
  })

  server.get('/api/sessions/:sessionId/queue', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    res.json({
      session: session.serialize(getOrigin(req)),
      count: session.player.queue.length,
      queue: session.player.getQueue()
    })
  })

  server.get('/api/sessions/:sessionId/state', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    res.json(serializeState(session, req))
  })

  server.post('/api/request', (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    handleRequestSong(req, res, session)
  })

  server.post('/api/twitch/request', (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    handleRequestSong(req, res, session)
  })

  server.post('/api/sessions/:sessionId/request', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    handleRequestSong(req, res, session)
  })

  server.post('/api/sessions/:sessionId/requests', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    handleRequestSong(req, res, session)
  })

  server.post('/api/sessions/:sessionId/twitch/request', (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    handleRequestSong(req, res, session)
  })

  server.post('/api/admin/queue', requireAdminApiKey, (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    handleAdminQueue(req, res, session)
  })

  server.post('/api/sessions/:sessionId/admin/queue', requireAdminApiKey, (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    handleAdminQueue(req, res, session)
  })

  server.post('/api/admin/queue/clear', requireAdminApiKey, (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    session.player.clearQueue()
    res.json({ ok: true, session: session.serialize(getOrigin(req)) })
  })

  server.post('/api/sessions/:sessionId/admin/queue/clear', requireAdminApiKey, (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    session.player.clearQueue()
    res.json({ ok: true, session: session.serialize(getOrigin(req)) })
  })

  server.post('/api/admin/fallback/play', requireAdminApiKey, (req, res) => {
    const session = getSessionOr404(req, res)
    if (!session) return
    const fallbackUri = normalizeSpotifyUri(config.fallbackPlaylistUri)

    if (!fallbackUri) {
      res.status(400).json({ error: 'FALLBACK_PLAYLIST_URI is not configured.' })
      return
    }

    session.socketServer.emitToPlaybackLeader('adminPlayFallback', fallbackUri)
    res.json({ ok: true, session: session.serialize(getOrigin(req)), fallbackPlaylistUri: fallbackUri })
  })

  server.post('/api/sessions/:sessionId/admin/fallback/play', requireAdminApiKey, (req, res) => {
    const session = getSessionOr404(req, res, readRouteParam(req.params.sessionId))
    if (!session) return
    const fallbackUri = normalizeSpotifyUri(config.fallbackPlaylistUri)

    if (!fallbackUri) {
      res.status(400).json({ error: 'FALLBACK_PLAYLIST_URI is not configured.' })
      return
    }

    session.socketServer.emitToPlaybackLeader('adminPlayFallback', fallbackUri)
    res.json({ ok: true, session: session.serialize(getOrigin(req)), fallbackPlaylistUri: fallbackUri })
  })

  server.use((req, res) => {
    return handle(req, res)
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
