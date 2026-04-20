# Spotify Listen Together (Server)
To understand what this is, visit [Spotify Listen Together](https://github.com/NekoSuneProjects/spotify-listen-together).

### Creating a server
The server must be hosted somewhere.

### Local environment
Copy `.env.example` to `.env` and change values as needed.

Supported environment variables:

- `HOST_PASSWORD`
- `MAX_DELAY`
- `PORT`
- `API_KEY`
- `FALLBACK_PLAYLIST_URI`

The server now loads `.env` on startup for local development and production runs started from the project root.

### Public GET API
No API key is required for these read-only endpoints:

- `GET /api/health`
- `GET /api/song`
- `GET /api/listeners`
- `GET /api/queue`
- `GET /api/state`

### Admin API
Protected endpoints accept either `x-api-key: <API_KEY>` or `Authorization: Bearer <API_KEY>`.

- `POST /api/admin/queue`
- `POST /api/admin/queue/clear`
- `POST /api/admin/fallback/play`

`POST /api/admin/queue` accepts a `tracks` array and optional `playNow: true`.
When a host is connected, the queue remains host-controlled and `playNow` will not override the host.
When no host is connected, queued songs can drive shared playback automatically.
`FALLBACK_PLAYLIST_URI` is used automatically when the queue becomes empty and no host is online.
You can use either Spotify URIs like `spotify:track:...` or Spotify URLs like `https://open.spotify.com/track/...`.

Track queue with `curl`:

```bash
curl -X POST http://localhost:3000/api/admin/queue \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "playNow": false,
    "tracks": [
      {
        "uri": "spotify:track:4EMbF2dOOghqwcenbveoTH",
        "metadata": {
          "title": "TILL MY HEART STOPS",
          "artist_name": "Example Artist",
          "album_title": "Example Album"
        }
      }
    ]
  }'
```

Playlist queue with `curl`:

```bash
curl -X POST http://localhost:3000/api/admin/queue \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "playNow": true,
    "tracks": [
      {
        "uri": "https://open.spotify.com/playlist/3Asq8TzkSbQXxNiZ2baNs8",
        "metadata": {
          "title": "Requested Playlist"
        }
      }
    ]
  }'
```

Album queue with `fetch`:

```js
await fetch("http://localhost:3000/api/admin/queue", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY",
  },
  body: JSON.stringify({
    playNow: true,
    tracks: [
      {
        uri: "spotify:album:1A2GTWGtFfWp7KSQTwWOyo",
        metadata: {
          title: "Requested Album",
        },
      },
    ],
  }),
});
```

Trigger the configured fallback with `fetch`:

```js
await fetch("http://localhost:3000/api/admin/fallback/play", {
  method: "POST",
  headers: {
    "x-api-key": "YOUR_API_KEY",
  },
});
```

To host with Render:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/NekoSuneProjects/spotify-listen-together-server)
