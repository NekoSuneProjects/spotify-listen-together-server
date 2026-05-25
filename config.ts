import './backend/loadEnv'

function readStringEnv(name: string, fallback = '') {
  const value = process.env[name]
  return value ? value.trim() : fallback
}

function readIntEnv(name: string, fallback: number) {
  const value = process.env[name]?.trim()

  if (!value) {
    return fallback
  }

  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function readBoolEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase()

  if (!value) {
    return fallback
  }

  return ["1", "true", "yes", "on"].includes(value)
}

export default {
  adminPassword: readStringEnv("ADMIN_PASSWORD"),
  hostPassword: readStringEnv("HOST_PASSWORD"),
  allowGlobalHostPassword: readBoolEnv("ALLOW_GLOBAL_HOST_PASSWORD"),
  maxDelay: readIntEnv("MAX_DELAY", 5000),
  apiKey: readStringEnv("API_KEY"),
  fallbackPlaylistUri: readStringEnv("FALLBACK_PLAYLIST_URI"),
  clientVersionRequirements: "0.5.x",
  clientRecommendedVersion: "0.5.3",
  clientUpdateUrl: readStringEnv("CLIENT_UPDATE_URL", "https://github.com/NekoSuneProjectsForks/spotify-listen-together/releases/latest"),
  banAppealUrl: readStringEnv("BAN_APPEAL_URL", "https://nekosunevr.co.uk/?redirect=discord"),
  socketPingIntervalMs: Math.max(readIntEnv("SOCKET_PING_INTERVAL_MS", 10000), 1000),
  socketPingTimeoutMs: Math.max(readIntEnv("SOCKET_PING_TIMEOUT_MS", 20000), 5000),
  progressUpdateMinIntervalMs: Math.max(readIntEnv("PROGRESS_UPDATE_MIN_INTERVAL_MS", 5000), 250),
  progressUpdateDriftToleranceMs: Math.max(readIntEnv("PROGRESS_UPDATE_DRIFT_TOLERANCE_MS", 1500), 0),
  desyncGraceMs: Math.max(readIntEnv("DESYNC_GRACE_MS", 3000), 0),
  desyncResyncMinIntervalMs: Math.max(readIntEnv("DESYNC_RESYNC_MIN_INTERVAL_MS", 5000), 1000),
  maxQueueLength: Math.max(readIntEnv("MAX_QUEUE_LENGTH", 100), 1),
  maxSessions: Math.max(readIntEnv("MAX_SESSIONS", 250), 1),
  apiSessionCreateLimit: Math.max(readIntEnv("API_SESSION_CREATE_LIMIT", 20), 1),
  apiRequestLimit: Math.max(readIntEnv("API_REQUEST_LIMIT", 60), 1),
  socketQueueEventLimit: Math.max(readIntEnv("SOCKET_QUEUE_EVENT_LIMIT", 30), 1),
  debugSocketEvents: readBoolEnv("DEBUG_SOCKET_EVENTS"),
  debugPlayback: readBoolEnv("DEBUG_PLAYBACK")
}
