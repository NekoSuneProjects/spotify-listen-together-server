function readIntEnv(name: string, fallback: number) {
  const value = process.env[name]

  if (!value) {
    return fallback
  }

  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export default {
  hostPassword: process.env.HOST_PASSWORD || "1234",
  maxDelay: readIntEnv("MAX_DELAY", 5000),
  apiKey: process.env.API_KEY || "",
  fallbackPlaylistUri: process.env.FALLBACK_PLAYLIST_URI || "",
  clientVersionRequirements: "0.5.x",
  clientRecommendedVersion: "0.5.0"
}
