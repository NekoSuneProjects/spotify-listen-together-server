import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import config from '../../config';

type SessionSummary = {
  id: string;
  name: string;
  isPublic: boolean;
  visibility: 'public' | 'private';
  url: string;
  createdAt: string;
  updatedAt: string;
  emptySince: string | null;
  expiresAt: string | null;
  listenerCount: number;
  queueCount: number;
  host: {
    name: string;
    trackUri: string;
  } | null;
  song: {
    trackUri: string;
    name: string;
    image: string;
    artistName: string;
    albumName: string;
    paused: boolean;
    locked: boolean;
  };
};

function absoluteUrl(path: string) {
  if (typeof window === 'undefined') {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const Index: NextPage = () => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [name, setName] = useState('Listen Together Session');
  const [isPublic, setIsPublic] = useState(true);
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const publicSessions = useMemo(
    () => sessions.filter((session) => session.isPublic),
    [sessions],
  );

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/sessions');
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setSessions(data.sessions || []);
    } catch {}
  };

  useEffect(() => {
    let socket: Socket | null = io();

    socket.on('sessionsUpdated', (nextSessions: SessionSummary[]) => {
      setSessions(nextSessions || []);
    });

    loadSessions();
    const refresh = setInterval(loadSessions, 5000);
    return () => {
      clearInterval(refresh);
      socket?.disconnect();
      socket = null;
    };
  }, []);

  const createSession = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setCreating(true);

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          isPublic,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || 'Session could not be created.');
        return;
      }

      const hostPassword = data.session?.hostPassword;
      window.location.href = hostPassword
        ? `${data.session.url}?hostPassword=${encodeURIComponent(hostPassword)}`
        : data.session.url;
    } catch {
      setError('Session could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const openInvite = () => {
    const value = invite.trim();
    if (!value) {
      return;
    }

    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      const match = url.pathname.match(/\/session\/([^/?#]+)/);
      if (match?.[1]) {
        window.location.href = `/session/${decodeURIComponent(match[1])}`;
        return;
      }
    }

    window.location.href = `/session/${encodeURIComponent(value)}`;
  };

  return (
    <main className="min-h-screen bg-hero-radial text-white">
      <Head>
        <title>Spotify Listen Together Sessions</title>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      </Head>

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 text-xs uppercase text-spotify-200">
              Live sessions
            </div>
            <h1 className="text-4xl font-black text-white sm:text-5xl">
              Spotify Listen Together
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
              Create a host-controlled session, share the invite URL, and expose session now-playing endpoints for VRChat OSC or Twitch request bots.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/instructions"
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-spotify-400/40"
            >
              Install Client
            </Link>
            <a
              href="https://github.com/NekoSuneProjects/spotify-listen-together"
              className="rounded-lg bg-spotify-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-spotify-400"
            >
              GitHub
            </a>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
          <div className="space-y-6">
            <form
              onSubmit={createSession}
              className="rounded-lg border border-white/10 bg-black/30 p-5"
            >
              <h2 className="text-xl font-black">Create Session</h2>
              <p className="mt-2 text-sm text-white/55">
                A private host password is generated for each session. Public sessions show here; private sessions only work through their invite URL.
              </p>

              <label className="mt-5 block text-sm text-white/70">
                Session name
                <input
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-white outline-none focus:border-spotify-400"
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </label>

              <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/70">
                <span>Show in public session list</span>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.currentTarget.checked)}
                  className="h-5 w-5 accent-spotify-500"
                />
              </label>

              {error ? (
                <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={creating}
                className="mt-5 w-full rounded-lg bg-spotify-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-spotify-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create Session'}
              </button>
            </form>

            <div className="rounded-lg border border-white/10 bg-black/30 p-5">
              <h2 className="text-xl font-black">Join Private Invite</h2>
              <p className="mt-2 text-sm text-white/55">
                Paste a private session URL or only the session ID.
              </p>
              <div className="mt-5 flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-white outline-none focus:border-spotify-400"
                  value={invite}
                  onChange={(event) => setInvite(event.currentTarget.value)}
                  placeholder="session id or invite url"
                />
                <button
                  type="button"
                  onClick={openInvite}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:border-spotify-400/40"
                >
                  Open
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/30 p-5 text-sm text-white/60">
              <div className="font-semibold text-white">API shape</div>
              <div className="mt-3 space-y-2 font-mono text-xs">
                <div>/api/sessions/:id/nowplaying</div>
                <div>/api/sessions/:id/request</div>
                <div>/api/sessions/:id/twitch/request</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-5">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-black">Public Sessions</h2>
                <p className="mt-2 text-sm text-white/55">
                  Empty sessions are deleted after five minutes.
                </p>
              </div>
              <button
                type="button"
                onClick={loadSessions}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition hover:border-spotify-400/40"
              >
                Refresh
              </button>
            </div>

            <div className="grid gap-3">
              {publicSessions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center text-white/45">
                  No public sessions are active.
                </div>
              ) : (
                publicSessions.map((session) => (
                  <Link
                    key={session.id}
                    href={`/session/${session.id}`}
                    className="grid gap-4 rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-spotify-400/40 hover:bg-white/10 md:grid-cols-[88px_1fr_auto]"
                  >
                    <img
                      src={session.song.image || '/images/NoSong.png'}
                      alt=""
                      className="h-[88px] w-[88px] rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-black text-white">
                          {session.name}
                        </h3>
                        <span className="rounded-md border border-spotify-400/30 bg-spotify-500/10 px-2 py-1 text-xs uppercase text-spotify-100">
                          Public
                        </span>
                      </div>
                      <p className="mt-2 truncate text-sm text-white/65">
                        {session.song.name || 'Waiting for playback'}
                      </p>
                      <p className="mt-1 truncate text-sm text-spotify-200">
                        {session.song.artistName || session.host?.name || 'No host connected'}
                      </p>
                      <p className="mt-3 truncate font-mono text-xs text-white/35">
                        {absoluteUrl(session.url)}
                      </p>
                    </div>
                    <div className="grid min-w-[150px] grid-cols-3 gap-2 text-center md:grid-cols-1">
                      <div className="rounded-lg bg-black/25 px-3 py-2">
                        <div className="text-lg font-black">{session.listenerCount}</div>
                        <div className="text-xs text-white/45">Listeners</div>
                      </div>
                      <div className="rounded-lg bg-black/25 px-3 py-2">
                        <div className="text-lg font-black">{session.queueCount}</div>
                        <div className="text-xs text-white/45">Queue</div>
                      </div>
                      <div className="rounded-lg bg-black/25 px-3 py-2">
                        <div className="text-sm font-black">{formatUpdatedAt(session.updatedAt)}</div>
                        <div className="text-xs text-white/45">Updated</div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <div>
            Recommended client version <span className="font-semibold text-spotify-200">v{config.clientRecommendedVersion}</span>
          </div>
          <div>Private sessions stay hidden from the public list.</div>
        </footer>
      </div>
    </main>
  );
};

export default Index;
