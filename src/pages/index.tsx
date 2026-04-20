import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import config from '../../config';

type Listener = {
  name: string;
  isHost: boolean;
  loggedIn: boolean;
  latency: number;
  trackUri: string;
};

type QueueTrack = {
  uri: string;
  metadata?: {
    title?: string;
    album_title?: string;
    artist_name?: string;
    image_url?: string;
  };
};

type ApiState = {
  serverTime: string;
  host: {
    name: string;
    trackUri: string;
  } | null;
  song: {
    trackUri: string;
    name: string;
    image: string;
    artistName: string;
    artists: string[];
    albumName: string;
    durationMs: number;
    paused: boolean;
    locked: boolean;
    loading: boolean;
    progressMs: number;
    remainingMs: number;
    endsAt: string | null;
  };
  listeners: Listener[];
  queue: QueueTrack[];
  fallbackPlaylistUri: string | null;
};

function formatDuration(ms?: number) {
  const totalSeconds = Math.max(Math.floor((ms || 0) / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatClock(value?: string | null) {
  if (!value) {
    return '--:--';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const Index: NextPage = () => {
  const [state, setState] = useState<ApiState | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const socket = io();
    const rebuildSong = (partialSong: Partial<ApiState['song']>) => {
      setState((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          song: {
            ...current.song,
            ...partialSong,
          },
        };
      });
    };

    const loadState = async () => {
      try {
        const response = await fetch('/api/state');
        if (!response.ok) {
          return;
        }

        const nextState = (await response.json()) as ApiState;
        setState(nextState);
      } catch {}
    };

    socket.on('connect', () => {
      socket.emit('requestSongInfo');
      socket.emit('requestListeners');
      socket.emit('requestQueue');
      loadState();
    });

    socket.on('songInfo', (songInfo: Partial<ApiState['song']>) => {
      rebuildSong(songInfo);
    });

    socket.on('listeners', (listeners: Listener[]) => {
      setState((current) =>
        current
          ? {
              ...current,
              listeners,
              host: listeners.find((listener) => listener.isHost)
                ? {
                    name: listeners.find((listener) => listener.isHost)!.name,
                    trackUri:
                      listeners.find((listener) => listener.isHost)!.trackUri,
                  }
                : null,
            }
          : current,
      );
    });

    socket.on('queueUpdate', (queue: QueueTrack[]) => {
      setState((current) => (current ? { ...current, queue } : current));
    });

    socket.on('addToQueue', (items: QueueTrack[]) => {
      setState((current) =>
        current ? { ...current, queue: [...current.queue, ...items] } : current,
      );
    });

    socket.on('removeFromQueue', (items: QueueTrack[]) => {
      const removedUris = new Set(items.map((item) => item.uri));
      setState((current) =>
        current
          ? {
              ...current,
              queue: current.queue.filter((item) => !removedUris.has(item.uri)),
            }
          : current,
      );
    });

    socket.on('clearQueue', () => {
      setState((current) => (current ? { ...current, queue: [] } : current));
    });

    const clock = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    loadState();
    return () => {
      clearInterval(clock);
      socket.disconnect();
    };
  }, []);

  const openSpotify = () => {
    window.open(
      `spotify:listentogether:${encodeURIComponent(
        typeof location !== 'undefined'
          ? location.protocol + '//' + location.host
          : '',
      )}`,
      '_self',
    );
  };

  const song = state?.song;
  const listeners = state?.listeners || [];
  const queue = state?.queue || [];
  const hasActiveSong = Boolean(song?.trackUri || song?.name);
  const liveProgressMs =
    song && !song.paused && song.durationMs > 0 && song.endsAt
      ? Math.max(song.durationMs - Math.max(new Date(song.endsAt).getTime() - nowMs, 0), song.progressMs)
      : song?.progressMs || 0;
  const liveRemainingMs =
    song && song.durationMs > 0 ? Math.max(song.durationMs - liveProgressMs, 0) : 0;
  const progressPercent =
    song && song.durationMs > 0
      ? Math.min((liveProgressMs / song.durationMs) * 100, 100)
      : 0;

  return (
    <main className="min-h-screen bg-hero-radial text-white">
      <Head>
        <title>Spotify Listen Together</title>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      </Head>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_center,rgba(29,185,84,0.22),transparent_55%)] blur-3xl" />

        <header className="mb-10 flex flex-col gap-6 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-spotify-400/30 bg-spotify-500/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-spotify-200">
              <span className="h-2 w-2 rounded-full bg-spotify-400" />
              Live Sync Room
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
              Spotify <span className="text-spotify-400">Listen Together</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
              Public room dashboard, live playback state, queue visibility, and bot-friendly APIs for song requests.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="rounded-2xl bg-spotify-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-spotify-400"
              onClick={openSpotify}
            >
              Open In Spotify
            </button>
            <Link
              href="/instructions"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-semibold text-white transition hover:border-spotify-400/40 hover:bg-white/10"
            >
              Install Client
            </Link>
          </div>
        </header>

        <section className="grid flex-1 gap-6 lg:grid-cols-[1.6fr_0.95fr]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 shadow-glow backdrop-blur">
              <div className="grid gap-0 md:grid-cols-[320px_1fr]">
                <div className="relative min-h-[320px] bg-black/30">
                  <img
                    src={song?.image || '/images/NoSong.png'}
                    alt={song?.name ? `${song.name} cover` : 'No song'}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs uppercase tracking-[0.25em] text-white/70">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        song?.paused ? 'bg-white/40' : 'animate-pulse bg-spotify-400'
                      }`}
                    />
                    {song?.loading ? 'Loading' : song?.paused ? 'Paused' : 'Playing'}
                  </div>
                </div>

                <div className="flex flex-col justify-between p-6 sm:p-8">
                  <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-spotify-400/20 bg-spotify-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-spotify-200">
                        Now Playing
                      </span>
                      {song?.locked ? (
                        <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
                          Locked By Ad Sync
                        </span>
                      ) : null}
                    </div>

                    <h2 className="text-3xl font-black text-white sm:text-4xl">
                      {song?.name || 'No active track'}
                    </h2>
                    <p className="mt-3 text-lg text-spotify-200">
                      {song?.artistName ||
                        (hasActiveSong
                          ? 'Artist metadata syncing...'
                          : 'Waiting for the host to start playback')}
                    </p>
                    <p className="mt-2 text-sm text-white/45">
                      {song?.albumName ||
                        (hasActiveSong ? 'Album metadata syncing...' : 'No album context yet')}
                    </p>
                  </div>

                  <div className="mt-10">
                    <div className="mb-3 flex items-center justify-between text-sm text-white/65">
                      <span>{formatDuration(liveProgressMs)}</span>
                      <span>{song?.durationMs ? formatDuration(song.durationMs) : '--:--'}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-spotify-300 via-spotify-400 to-spotify-500 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-white/70 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                          Current Time
                        </div>
                        <div className="mt-1 font-semibold text-white">
                          {formatDuration(liveProgressMs)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                          Remaining
                        </div>
                        <div className="mt-1 font-semibold text-white">
                          {song?.durationMs ? formatDuration(liveRemainingMs) : 'Syncing'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                          Ends At
                        </div>
                        <div className="mt-1 font-semibold text-white">
                          {song?.endsAt ? formatClock(song.endsAt) : 'Syncing'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.25em] text-white/40">
                  Host
                </div>
                <div className="mt-3 text-2xl font-black text-white">
                  {state?.host?.name || 'No host'}
                </div>
                <div className="mt-2 text-sm text-white/55">
                  Current room controller
                </div>
              </div>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.25em] text-white/40">
                  Active Listeners
                </div>
                <div className="mt-3 text-2xl font-black text-white">
                  {listeners.length}
                </div>
                <div className="mt-2 text-sm text-white/55">
                  Synced clients in the room
                </div>
              </div>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.25em] text-white/40">
                  Queue Depth
                </div>
                <div className="mt-3 text-2xl font-black text-white">
                  {queue.length}
                </div>
                <div className="mt-2 text-sm text-white/55">
                  Twitch or manual requests waiting
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-white">Listeners</h3>
                  <p className="mt-1 text-sm text-white/55">
                    Live participants connected to the room
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                {listeners.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-white/45">
                    Nobody is connected yet.
                  </div>
                ) : (
                  listeners.map((listener) => (
                    <div
                      key={`${listener.name}-${listener.trackUri}-${listener.latency}`}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {listener.name}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.2em] text-white/40">
                          {listener.isHost ? 'Host' : 'Listener'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-spotify-200">
                          {Math.round(listener.latency)}ms
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          Sync latency
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="mb-5">
                <h3 className="text-xl font-black text-white">Queue</h3>
                <p className="mt-1 text-sm text-white/55">
                  Requests can be fed by your Twitch bot through the admin API.
                </p>
              </div>

              <div className="space-y-3">
                {queue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-spotify-400/20 bg-spotify-500/5 px-4 py-8 text-center">
                    <div className="text-sm font-semibold text-spotify-100">
                      Queue is empty
                    </div>
                    <div className="mt-2 text-sm text-white/50">
                      Let the host playlist continue as fallback, or trigger the fallback API if configured.
                    </div>
                  </div>
                ) : (
                  queue.map((track, index) => (
                    <div
                      key={`${track.uri}-${index}`}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="text-xs uppercase tracking-[0.25em] text-white/35">
                        #{index + 1}
                      </div>
                      <div className="mt-2 font-semibold text-white">
                        {track.metadata?.title || track.uri}
                      </div>
                      <div className="mt-1 text-sm text-spotify-200">
                        {track.metadata?.artist_name || 'Unknown artist'}
                      </div>
                      <div className="mt-1 text-xs text-white/40">
                        {track.metadata?.album_title || 'No album metadata'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </aside>
        </section>

        <footer className="mt-8 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-black/25 p-5 text-sm text-white/55 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            Recommended client version <span className="font-semibold text-spotify-200">v{config.clientRecommendedVersion}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a href="https://github.com/NekoSuneProjects/spotify-listen-together" className="transition hover:text-white">
              GitHub
            </a>
            <a href="https://github.com/NekoSuneProjects" className="transition hover:text-white">
              NekoSuneProjects
            </a>
            <a href="https://github.com/FlafyDev" className="transition hover:text-white">
              Original fork base
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
};

export default Index;
