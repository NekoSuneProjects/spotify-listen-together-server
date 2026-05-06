import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type OverlayStyle =
  | 'default'
  | 'bash'
  | 'discord'
  | 'macos'
  | 'windows'
  | 'soundcloud'
  | 'youtube';

type ApiSong = {
  trackUri: string;
  name: string;
  image: string;
  artistName: string;
  artists?: string[];
  albumName: string;
  durationMs: number;
  paused: boolean;
  locked?: boolean;
  loading?: boolean;
  progressMs: number;
  remainingMs?: number;
  endsAt: string | null;
};

type ApiState = {
  serverTime: string;
  session: {
    id: string;
    name: string;
    isPublic: boolean;
    visibility: 'public' | 'private';
    url: string;
    listenerCount: number;
    queueCount: number;
    expiresAt: string | null;
  };
  song: ApiSong;
};

type SpotifyLikeSongData = {
  item: {
    name: string;
    artists: Array<{
      name: string;
      external_urls: {
        spotify: string;
      };
    }>;
    album: {
      images: Array<{ url?: string }>;
      external_urls: {
        spotify: string;
      };
    };
    external_urls: {
      spotify: string;
    };
  };
  is_playing: boolean;
};

type LayoutProps = {
  songData: SpotifyLikeSongData | null;
  progressSeconds: number;
  totalSeconds: number;
  formatTime: (seconds: number) => string;
  isLoading?: boolean;
};

const spotifyUser = 'NekoSuneVR';
const overlayStyles: OverlayStyle[] = [
  'default',
  'bash',
  'discord',
  'macos',
  'windows',
  'soundcloud',
  'youtube',
];

function formatTime(seconds: number) {
  const safeSeconds = Math.max(Math.floor(seconds || 0), 0);
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function spotifyUrlFromUri(uri?: string) {
  if (!uri) {
    return '#';
  }

  const [service, type, id] = uri.split(':');
  if (service !== 'spotify' || !type || !id) {
    return '#';
  }

  const supportedTypes: Record<string, string> = {
    album: 'album',
    artist: 'artist',
    episode: 'episode',
    playlist: 'playlist',
    show: 'show',
    track: 'track',
  };

  return supportedTypes[type]
    ? `https://open.spotify.com/${supportedTypes[type]}/${encodeURIComponent(id)}`
    : '#';
}

function readStyle(value: string | string[] | undefined): OverlayStyle {
  const style = Array.isArray(value) ? value[0] : value;
  return overlayStyles.includes(style as OverlayStyle) ? (style as OverlayStyle) : 'default';
}

function readSessionId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function songToSpotifyLikeData(song?: ApiSong | null): SpotifyLikeSongData | null {
  if (!song?.trackUri || !song.name) {
    return null;
  }

  const image = song.image || '/images/NoSong.png';
  const trackUrl = spotifyUrlFromUri(song.trackUri);
  const artistName = song.artistName || song.artists?.[0] || 'Unknown Artist';

  return {
    item: {
      name: song.name || 'Unknown Title',
      artists: [
        {
          name: artistName,
          external_urls: { spotify: trackUrl },
        },
      ],
      album: {
        images: [{}, { url: image }],
        external_urls: { spotify: trackUrl },
      },
      external_urls: { spotify: trackUrl },
    },
    is_playing: !song.paused,
  };
}

function DefaultLayout({ songData, progressSeconds, totalSeconds, formatTime, isLoading }: LayoutProps) {
  if (isLoading || !songData) return null;

  const progress = totalSeconds > 0 ? (progressSeconds / totalSeconds) * 100 : 0;
  const image = songData.item.album.images[1].url;

  return (
    <div className="default-container">
      <div className="default-background" style={{ backgroundImage: `url(${image})` }} />
      <img src={image} className="default-album-art" alt="Album art" />
      <div className="default-content">
        <div className="default-song">{songData.item.name}</div>
        <div className="default-artist">{songData.item.artists[0].name}</div>
        <div className="default-links hide-on-mobile">
          <a href={songData.item.external_urls.spotify} target="_blank" rel="noreferrer" className="default-link">Song</a>
          <a href={songData.item.artists[0].external_urls.spotify} target="_blank" rel="noreferrer" className="default-link">Artist</a>
          <a href={songData.item.album.external_urls.spotify} target="_blank" rel="noreferrer" className="default-link">Album</a>
        </div>
        <div className="default-status">{songData.is_playing ? `${spotifyUser}'s now playing...` : `${spotifyUser} has paused.`}</div>
        <div className="default-progress-container">
          <div className="default-progress-bar">
            <div className="default-progress" style={{ width: `${progress}%` }} />
          </div>
          <div className="default-time hide-on-mobile">{`${formatTime(progressSeconds)} / ${formatTime(totalSeconds)}`}</div>
        </div>
        <div className="default-footer">
          <a href="https://nekosunevr.co.uk" target="_blank" rel="noreferrer">NekoSuneVR Now Playing</a>
        </div>
      </div>
    </div>
  );
}

function BashLayout({ songData, progressSeconds, totalSeconds, formatTime, isLoading }: LayoutProps) {
  if (isLoading || !songData) return null;

  const progressPercent = totalSeconds > 0
    ? Math.min(Math.max((progressSeconds / totalSeconds) * 20, 0), 20)
    : 0;
  const filled = Math.floor(progressPercent);
  const empty = 20 - filled;
  const progressBar = `${'='.repeat(filled)}${'-'.repeat(empty)}`;

  return (
    <div className="bash-container">
      <div className="bash-song">$ {songData.item.name} by {songData.item.artists[0].name}</div>
      <div className="bash-status">$ {songData.is_playing ? 'playing' : 'paused'}</div>
      <div className="bash-progress">$ progress: [{progressBar}] {formatTime(progressSeconds)}/{formatTime(totalSeconds)}</div>
      <div className="bash-links hide-on-mobile">
        <a href={songData.item.external_urls.spotify} target="_blank" rel="noreferrer" className="bash-link">$ song: {songData.item.external_urls.spotify}</a>
        <a href={songData.item.artists[0].external_urls.spotify} target="_blank" rel="noreferrer" className="bash-link">$ artist: {songData.item.artists[0].external_urls.spotify}</a>
        <a href={songData.item.album.external_urls.spotify} target="_blank" rel="noreferrer" className="bash-link">$ album: {songData.item.album.external_urls.spotify}</a>
      </div>
      <div className="bash-footer">$ powered by <a href="https://nekosunevr.co.uk" target="_blank" rel="noreferrer">NekoSuneVR Now Playing</a></div>
    </div>
  );
}

function DiscordLayout({ songData, progressSeconds, totalSeconds, formatTime, isLoading }: LayoutProps) {
  if (isLoading || !songData) return null;

  const progress = totalSeconds > 0 ? (progressSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="discord-container">
      <img src={songData.item.album.images[1].url} className="discord-album-art" alt="Album art" />
      <div className="discord-content">
        <div className="discord-song">{songData.item.name}</div>
        <div className="discord-artist">{songData.item.artists[0].name}</div>
        <div className="discord-status">{songData.is_playing ? 'Now Playing' : 'Paused'}</div>
        <div className="discord-progress-bar">
          <div className="discord-progress" style={{ width: `${progress}%` }} />
        </div>
        <div className="discord-time hide-on-mobile">{`${formatTime(progressSeconds)} / ${formatTime(totalSeconds)}`}</div>
        <div className="discord-links hide-on-mobile">
          <a href={songData.item.external_urls.spotify} target="_blank" rel="noreferrer" className="discord-link">Song</a>
          <a href={songData.item.artists[0].external_urls.spotify} target="_blank" rel="noreferrer" className="discord-link">Artist</a>
          <a href={songData.item.album.external_urls.spotify} target="_blank" rel="noreferrer" className="discord-link">Album</a>
        </div>
        <div className="discord-footer">
          <a href="https://nekosunevr.co.uk" target="_blank" rel="noreferrer">NekoSuneVR Now Playing</a>
        </div>
      </div>
    </div>
  );
}

function MacOSLayout({ songData, progressSeconds, totalSeconds, formatTime, isLoading }: LayoutProps) {
  if (isLoading || !songData) return null;

  const progress = totalSeconds > 0 ? (progressSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="macos-container">
      <div className="macos-background" />
      <img src={songData.item.album.images[1].url} className="macos-album-art" alt="Album art" />
      <div className="macos-content">
        <div className="macos-song">{songData.item.name}</div>
        <div className="macos-artist">{songData.item.artists[0].name}</div>
        <div className="macos-status">{songData.is_playing ? 'Now Playing' : 'Paused'}</div>
      </div>
      <div className="macos-progress-container">
        <div className="macos-progress-bar">
          <div className="macos-progress" style={{ width: `${progress}%` }} />
        </div>
        <div className="macos-time hide-on-mobile">
          <span>{formatTime(progressSeconds)}</span>
          <span>{formatTime(totalSeconds)}</span>
        </div>
      </div>
      <div className="macos-links hide-on-mobile">
        <a href={songData.item.external_urls.spotify} target="_blank" rel="noreferrer" className="macos-link">Song</a>
        <a href={songData.item.artists[0].external_urls.spotify} target="_blank" rel="noreferrer" className="macos-link">Artist</a>
        <a href={songData.item.album.external_urls.spotify} target="_blank" rel="noreferrer" className="macos-link">Album</a>
      </div>
      <div className="macos-footer">
        <a href="https://nekosunevr.co.uk" target="_blank" rel="noreferrer">NekoSuneVR Now Playing</a>
      </div>
    </div>
  );
}

function WindowsLayout({ songData, progressSeconds, totalSeconds, formatTime, isLoading }: LayoutProps) {
  if (isLoading || !songData) return null;

  const progress = totalSeconds > 0 ? (progressSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="windows-container">
      <img src={songData.item.album.images[1].url} className="windows-album-art" alt="Album art" />
      <div className="windows-content">
        <div className="windows-song">{songData.item.name}</div>
        <div className="windows-artist">{songData.item.artists[0].name}</div>
        <div className="windows-status">{songData.is_playing ? 'Playing' : 'Paused'}</div>
        <div className="windows-progress-bar">
          <div className="windows-progress" style={{ width: `${progress}%` }} />
        </div>
        <div className="windows-time hide-on-mobile">{`${formatTime(progressSeconds)} / ${formatTime(totalSeconds)}`}</div>
        <div className="windows-links hide-on-mobile">
          <a href={songData.item.external_urls.spotify} target="_blank" rel="noreferrer" className="windows-link">Song</a>
          <a href={songData.item.artists[0].external_urls.spotify} target="_blank" rel="noreferrer" className="windows-link">Artist</a>
          <a href={songData.item.album.external_urls.spotify} target="_blank" rel="noreferrer" className="windows-link">Album</a>
        </div>
        <div className="windows-footer">
          <a href="https://nekosunevr.co.uk" target="_blank" rel="noreferrer">NekoSuneVR Now Playing</a>
        </div>
      </div>
    </div>
  );
}

function SoundCloudLayout({ songData, progressSeconds, totalSeconds, formatTime, isLoading }: LayoutProps) {
  if (isLoading || !songData) return null;

  const progress = totalSeconds > 0 ? (progressSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="soundcloud-container">
      <div className="soundcloud-background" />
      <div className="soundcloud-header">
        <img src={songData.item.album.images[1].url} className="soundcloud-album-art" alt="Album art" />
        <div className="soundcloud-title">
          <div className="soundcloud-song">{songData.item.name}</div>
          <div className="soundcloud-artist">{songData.item.artists[0].name}</div>
        </div>
      </div>
      <div className="soundcloud-progress-container">
        <div className="soundcloud-play-button" aria-label={songData.is_playing ? 'Playing' : 'Paused'} />
        <div className="soundcloud-progress-bar">
          <div className="soundcloud-progress" style={{ width: `${progress}%` }} />
        </div>
        <div className="soundcloud-time">{formatTime(progressSeconds)}</div>
      </div>
      <div className="soundcloud-links hide-on-mobile">
        <a href={songData.item.external_urls.spotify} target="_blank" rel="noreferrer" className="soundcloud-link">Song</a>
        <a href={songData.item.artists[0].external_urls.spotify} target="_blank" rel="noreferrer" className="soundcloud-link">Artist</a>
        <a href={songData.item.album.external_urls.spotify} target="_blank" rel="noreferrer" className="soundcloud-link">Album</a>
      </div>
      <div className="soundcloud-footer">
        <a href="https://nekosunevr.co.uk" target="_blank" rel="noreferrer">NekoSuneVR Now Playing</a>
      </div>
    </div>
  );
}

function YouTubeLayout({ songData, progressSeconds, totalSeconds, formatTime, isLoading }: LayoutProps) {
  if (isLoading || !songData) return null;

  const progress = totalSeconds > 0 ? (progressSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="youtube-container bg-gray-900 text-white p-4 rounded-lg max-w-lg mx-auto">
      <div className="youtube-thumbnail relative">
        <img
          src={songData.item.album.images[1].url}
          className="w-full h-auto rounded-lg"
          alt="Video thumbnail"
        />
        <div className="youtube-controls absolute bottom-0 w-full p-2 bg-black bg-opacity-50 backdrop-blur-md rounded-b-lg flex items-center justify-between">
          <span className="youtube-status text-sm">
            {songData.is_playing ? 'Playing' : 'Paused'}
          </span>
          <div className="youtube-time text-sm">
            {formatTime(progressSeconds)} / {formatTime(totalSeconds)}
          </div>
        </div>
      </div>
      <div className="youtube-content mt-4">
        <div className="youtube-title text-lg font-bold">
          {songData.item.name}
        </div>
        <div className="youtube-channel text-sm text-gray-400">
          {songData.item.artists[0].name}
        </div>
        <div className="youtube-progress-container mt-2">
          <div className="youtube-progress-bar w-full h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="youtube-progress h-full bg-red-600"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="youtube-links mt-2 flex space-x-4 text-sm">
          <a
            href={songData.item.external_urls.spotify}
            target="_blank"
            rel="noreferrer"
            className="text-red-500 hover:underline"
          >
            Watch Video
          </a>
          <a
            href={songData.item.artists[0].external_urls.spotify}
            target="_blank"
            rel="noreferrer"
            className="text-red-500 hover:underline"
          >
            Channel
          </a>
        </div>
        <div className="youtube-footer mt-4 text-xs text-gray-500">
          <a href="https://nekosunevr.co.uk" target="_blank" rel="noreferrer">
            NekoSuneVR Now Playing
          </a>
        </div>
      </div>
    </div>
  );
}

function renderLayout(style: OverlayStyle, props: LayoutProps) {
  switch (style) {
    case 'bash':
      return <BashLayout {...props} />;
    case 'discord':
      return <DiscordLayout {...props} />;
    case 'macos':
      return <MacOSLayout {...props} />;
    case 'windows':
      return <WindowsLayout {...props} />;
    case 'soundcloud':
      return <SoundCloudLayout {...props} />;
    case 'youtube':
      return <YouTubeLayout {...props} />;
    default:
      return <DefaultLayout {...props} />;
  }
}

const NowPlayingOverlay = () => {
  const router = useRouter();
  const sessionId = readSessionId(router.query.sessionId);
  const style = readStyle(router.query.style);
  const [state, setState] = useState<ApiState | null>(null);
  const [song, setSong] = useState<ApiSong | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [fetchTime, setFetchTime] = useState(Date.now());

  const loadState = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/state`, {
        cache: 'no-store',
      });
      if (response.status === 404) {
        setNotFound(true);
        setState(null);
        setSong(null);
        return;
      }

      if (!response.ok) {
        return;
      }

      const nextState = (await response.json()) as ApiState;
      setNotFound(false);
      setFetchTime(Date.now());
      setState(nextState);
      setSong(nextState.song);
    } catch {}
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let socket: Socket | null = io({
      auth: { sessionId },
      query: { sessionId },
    });

    socket.on('connect', () => {
      socket?.emit('requestSongInfo');
      loadState();
    });

    socket.on('songInfo', (songInfo: Partial<ApiSong>) => {
      setFetchTime(Date.now());
      setSong((current) => ({
        trackUri: '',
        name: '',
        image: '',
        artistName: '',
        artists: [],
        albumName: '',
        durationMs: 0,
        paused: true,
        progressMs: 0,
        endsAt: null,
        ...(current || {}),
        ...songInfo,
      }));
    });

    socket.on('sessionDeleted', () => {
      setNotFound(true);
      setState(null);
      setSong(null);
    });

    const refresh = setInterval(loadState, 10000);
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    loadState();

    return () => {
      clearInterval(refresh);
      clearInterval(clock);
      socket?.disconnect();
      socket = null;
    };
  }, [loadState, sessionId]);

  const liveProgress = useMemo(() => {
    if (!song || song.durationMs <= 0) {
      return { progressMs: 0, totalMs: 0 };
    }

    const progressMs = !song.paused && song.endsAt
      ? Math.min((song.progressMs || 0) + Math.max(nowMs - fetchTime, 0), song.durationMs)
      : song.progressMs || 0;

    return {
      progressMs,
      totalMs: song.durationMs,
    };
  }, [song, nowMs, fetchTime]);

  const songData = songToSpotifyLikeData(song);
  const title = state?.session.name
    ? `${state.session.name} - Now Playing`
    : 'NekoSuneVR - Now Playing';
  const image = song?.image || 'https://cdn.discordapp.com/avatars/100463282099326976/1ca9d9fa6f583efdac85bc924db0ea13?size=1024';

  return (
    <main className="np-overlay-page">
      <Head>
        <title>{title}</title>
        <meta name="twitter:card" content="player" />
        <meta name="twitter:site" content="@nekosunevr" />
        <meta name="twitter:player:width" content="640" />
        <meta name="twitter:player:height" content="240" />
        <meta name="twitter:image" content={image} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content="NekoSuneVR Now Playing Embed" />
        <meta property="og:image" content={image} />
        <style>{`
          html,
          body,
          #__next {
            background: transparent !important;
          }
        `}</style>
      </Head>

      <div className="np-overlay">
        <div className={`player-container ${style}`}>
          {notFound ? (
            <div className="default-container no-song">
              Session not found.
            </div>
          ) : !songData ? (
            <div className="default-container no-song">
              {spotifyUser} is not playing anything.
            </div>
          ) : (
            renderLayout(style, {
              songData,
              progressSeconds: Math.ceil(liveProgress.progressMs / 1000),
              totalSeconds: Math.ceil(liveProgress.totalMs / 1000),
              formatTime,
            })
          )}
        </div>
      </div>
    </main>
  );
};

export default NowPlayingOverlay;
