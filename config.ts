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

export default {
  hostPassword: readStringEnv("HOST_PASSWORD", "1234"),
  maxDelay: readIntEnv("MAX_DELAY", 5000),
  apiKey: readStringEnv("API_KEY"),
  fallbackPlaylistUri: readStringEnv("FALLBACK_PLAYLIST_URI"),
  clientVersionRequirements: "0.5.x",
  clientRecommendedVersion: "0.5.3",
  clientUpdateUrl: readStringEnv("CLIENT_UPDATE_URL", "https://github.com/NekoSuneProjects/spotify-listen-together/releases/latest"),
  banAppealUrl: readStringEnv("BAN_APPEAL_URL", "https://nekosunevr.co.uk/?redirect=discord")
}
