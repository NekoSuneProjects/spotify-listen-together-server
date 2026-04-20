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

To host with Render:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/NekoSuneProjects/spotify-listen-together-server)
