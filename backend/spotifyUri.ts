export function normalizeSpotifyUri(value?: string | null) {
  if (!value) {
    return ""
  }

  if (value.startsWith("spotify:")) {
    return value
  }

  try {
    const url = new URL(value)
    if (!url.hostname.includes("spotify.com")) {
      return value
    }

    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length >= 2) {
      return `spotify:${parts[0]}:${parts[1]}`
    }
  } catch {}

  return value
}

export function isSpotifyContextUri(uri: string) {
  return uri.startsWith("spotify:playlist:") || uri.startsWith("spotify:album:")
}
