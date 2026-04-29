import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Listener = {
  name: string;
  isHost: boolean;
  loggedIn?: boolean;
  latency?: number;
  trackUri?: string;
  watchingAD?: boolean;
};

type QueueTrack = {
  uri: string;
  metadata?: {
    title?: string;
    album_title?: string;
    artist_name?: string;
    image_url?: string;
    requested_by?: string;
  };
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

const SessionPage: NextPage = () => {
  const router = useRouter();
  const sessionId = typeof router.query.sessionId === 'string'
    ? router.query.sessionId
    : '';
  const generatedHostPassword = typeof router.query.hostPassword === 'string'
    ? router.query.hostPassword
    : '';
  const [state, setState] = useState<ApiState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [fetchTime, setFetchTime] = useState(Date.now());

  const loadState = async () => {
    if (!sessionId) {
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/state`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }

      if (!response.ok) {
        return;
      }

      const nextState = (await response.json()) as ApiState;
      setNotFound(false);
      setFetchTime(Date.now());
      setState(nextState);
    } catch {}
  };

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
      socket?.emit('requestListeners');
      socket?.emit('requestQueue');
      loadState();
    });

    socket.on('songInfo', (songInfo: Partial<ApiState['song']>) => {
      setState((current) =>
        current ? { ...current, song: { ...current.song, ...songInfo } } : current,
      );
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
                    trackUri: listeners.find((listener) => listener.isHost)!.trackUri || '',
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

    socket.on('sessionDeleted', () => {
      setNotFound(true);
    });

    socket.on('banned', (ban: { reason?: string }) => {
      window.location.href = `/banned?reason=${encodeURIComponent(ban?.reason || 'Banned by site moderation.')}`;
    });

    const refresh = setInterval(loadState, 3000);
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    loadState();

    return () => {
      clearInterval(refresh);
      clearInterval(clock);
      socket?.disconnect();
      socket = null;
    };
  }, [sessionId]);

  const song = state?.song;
  const liveProgress = useMemo(() => {
    if (!song || song.durationMs <= 0) {
      return { progressMs: 0, remainingMs: 0, percent: 0 };
    }

    const progressMs = !song.paused && song.endsAt
      ? Math.min((song.progressMs || 0) + Math.max(nowMs - fetchTime, 0), song.durationMs)
      : song.progressMs || 0;
    const remainingMs = Math.max(song.durationMs - progressMs, 0);

    return {
      progressMs,
      remainingMs,
      percent: Math.min((progressMs / song.durationMs) * 100, 100),
    };
  }, [song, nowMs, fetchTime]);

  const inviteUrl = typeof window === 'undefined'
    ? ''
    : `${window.location.origin}/session/${sessionId}`;
  const spotifyUrl = `spotify:listentogether:${encodeURIComponent(inviteUrl)}`;

  return (
    <main className="min-h-screen bg-hero-radial text-white">
      <Head>
        <title>{state?.session.name || 'Listen Together Session'}</title>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
      </Head>

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/" className="mb-3 inline-block text-sm text-spotify-200 transition hover:text-white">
              Back to sessions
            </Link>
            <h1 className="text-4xl font-black text-white">
              {state?.session.name || 'Listen Together Session'}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/60">
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                {state?.session.visibility || 'session'}
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                {state?.listeners.length || 0} listeners
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                {state?.queue.length || 0} queued
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={spotifyUrl}
              className="rounded-lg bg-spotify-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-spotify-400"
            >
              Open In Spotify
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(inviteUrl)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:border-spotify-400/40"
            >
              Copy Invite
            </button>
          </div>
        </header>

        {notFound ? (
          <div className="rounded-lg border border-white/10 bg-black/30 px-5 py-12 text-center">
            <h2 className="text-2xl font-black">Session not found</h2>
            <p className="mt-3 text-white/55">
              It may have been private, deleted, or empty for more than five minutes.
            </p>
          </div>
        ) : (
          <section className="grid flex-1 gap-6 lg:grid-cols-[1.5fr_0.95fr]">
            <div className="space-y-6">
              {generatedHostPassword ? (
                <div className="rounded-lg border border-spotify-400/30 bg-spotify-500/10 p-5">
                  <div className="text-xs uppercase text-spotify-200">
                    Session Host Password
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <code className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-lg text-white">
                      {generatedHostPassword}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(generatedHostPassword)}
                      className="rounded-lg bg-spotify-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-spotify-400"
                    >
                      Copy Host Password
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-white/60">
                    Save this now. It is only shown after session creation and is needed to become host in Spotify.
                  </p>
                </div>
              ) : null}

              <div className="grid overflow-hidden rounded-lg border border-white/10 bg-black/30 md:grid-cols-[300px_1fr]">
                <div className="relative min-h-[300px] bg-black/30">
                  <img
                    src={song?.image || '/images/NoSong.png'}
                    alt={song?.name ? `${song.name} cover` : 'No song'}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute bottom-4 left-4 rounded-md border border-white/10 bg-black/55 px-3 py-2 text-xs uppercase text-white/70">
                    {song?.loading ? 'Loading' : song?.paused ? 'Paused' : 'Playing'}
                  </div>
                </div>

                <div className="flex flex-col justify-between p-6">
                  <div>
                    <div className="mb-3 text-xs uppercase text-spotify-200">
                      Now Playing
                    </div>
                    <h2 className="text-3xl font-black text-white">
                      {song?.name || 'No active track'}
                    </h2>
                    <p className="mt-3 text-lg text-spotify-200">
                      {song?.artistName || 'Waiting for host playback'}
                    </p>
                    <p className="mt-2 text-sm text-white/45">
                      {song?.albumName || 'No album metadata'}
                    </p>
                  </div>

                  <div className="mt-10">
                    <div className="mb-3 flex items-center justify-between text-sm text-white/65">
                      <span>{formatDuration(liveProgress.progressMs)}</span>
                      <span>{song?.durationMs ? formatDuration(song.durationMs) : '--:--'}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-spotify-500 transition-all"
                        style={{ width: `${liveProgress.percent}%` }}
                      />
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-white/70 sm:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase text-white/40">Progress</div>
                        <div className="mt-1 font-semibold text-white">
                          {formatDuration(liveProgress.progressMs)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase text-white/40">Remaining</div>
                        <div className="mt-1 font-semibold text-white">
                          {song?.durationMs ? formatDuration(liveProgress.remainingMs) : 'Syncing'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase text-white/40">Ends At</div>
                        <div className="mt-1 font-semibold text-white">
                          {song?.endsAt ? formatClock(song.endsAt) : 'Syncing'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 p-5">
                <h3 className="text-xl font-black">Listeners</h3>
                <div className="mt-4 grid gap-3">
                  {(state?.listeners || []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-white/45">
                      Nobody is connected yet.
                    </div>
                  ) : (
                    state!.listeners.map((listener, index) => (
                      <div
                        key={`${listener.name}-${index}`}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <div>
                          <div className="font-semibold text-white">{listener.name}</div>
                          <div className="mt-1 text-xs uppercase text-white/40">
                            {listener.isHost ? 'Host' : 'Listener'}
                          </div>
                        </div>
                        <div className="text-sm text-spotify-200">
                          {listener.latency !== undefined ? `${Math.round(listener.latency)}ms` : '--'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <aside className="space-y-6">
              <div className="rounded-lg border border-white/10 bg-black/30 p-5">
                <h3 className="text-xl font-black">Queue</h3>
                <div className="mt-4 space-y-3">
                  {(state?.queue || []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-spotify-400/20 bg-spotify-500/5 px-4 py-8 text-center text-white/50">
                      Queue is empty.
                    </div>
                  ) : (
                    state!.queue.map((track, index) => (
                      <div
                        key={`${track.uri}-${index}`}
                        className="rounded-lg border border-white/10 bg-white/5 p-4"
                      >
                        <div className="text-xs uppercase text-white/35">#{index + 1}</div>
                        <div className="mt-2 font-semibold text-white">
                          {track.metadata?.title || track.uri}
                        </div>
                        <div className="mt-1 text-sm text-spotify-200">
                          {track.metadata?.artist_name || 'Unknown artist'}
                        </div>
                        {track.metadata?.requested_by ? (
                          <div className="mt-2 text-xs text-white/40">
                            Requested by {track.metadata.requested_by}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 p-5 text-sm text-white/60">
                <div className="font-semibold text-white">Integration URLs</div>
                <div className="mt-3 space-y-2 break-all font-mono text-xs">
                  <div>{`/api/sessions/${sessionId}/nowplaying`}</div>
                  <div>{`/api/sessions/${sessionId}/request`}</div>
                  <div>{`/api/sessions/${sessionId}/twitch/request`}</div>
                </div>
              </div>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
};

export default SessionPage;
