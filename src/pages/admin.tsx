import type { NextPage } from 'next';
import Head from 'next/head';
import { FormEvent, useState } from 'react';

type AdminListener = {
  socketId: string;
  name: string;
  isHost: boolean;
  ipAddress: string;
  visitorId: string;
};

type AdminSession = {
  id: string;
  name: string;
  visibility: string;
  listenerCount: number;
  queueCount: number;
  hostPassword: string;
  listeners: AdminListener[];
};

type BanRule = {
  id: string;
  reason: string;
  createdAt: string;
  ipAddress?: string;
  visitorId?: string;
  name?: string;
};

type AdminState = {
  sessions: AdminSession[];
  bans: BanRule[];
};

const Admin: NextPage = () => {
  const [adminPassword, setAdminPassword] = useState('');
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('Breaking rules or Terms of Service.');
  const [manualName, setManualName] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [manualVisitorId, setManualVisitorId] = useState('');

  const headers = {
    'Content-Type': 'application/json',
    'X-Admin-Password': adminPassword,
  };

  const loadState = async () => {
    setError('');
    const response = await fetch('/api/admin/state', { headers });
    const data = await response.json();

    if (!response.ok) {
      setError(data?.error || 'Admin login failed.');
      return;
    }

    setState(data);
  };

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    await loadState();
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm(`Delete session ${sessionId}?`)) {
      return;
    }

    await fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers,
    });
    await loadState();
  };

  const ban = async (body: Record<string, string>) => {
    await fetch('/api/admin/bans', {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason, ...body }),
    });
    setManualName('');
    setManualIp('');
    setManualVisitorId('');
    await loadState();
  };

  const unban = async (banId: string) => {
    await fetch(`/api/admin/bans/${encodeURIComponent(banId)}`, {
      method: 'DELETE',
      headers,
    });
    await loadState();
  };

  return (
    <main className="min-h-screen bg-hero-radial text-white">
      <Head>
        <title>Listen Together Admin</title>
      </Head>

      <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 border-b border-white/10 pb-6">
          <div className="text-xs uppercase text-spotify-200">Admin</div>
          <h1 className="mt-3 text-4xl font-black">Moderation Panel</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/60">
            Uses the server HOST_PASSWORD. Bans are stored server-side and can match IP, browser visitor ID, or display name.
          </p>
        </header>

        {!state ? (
          <form onSubmit={onLogin} className="max-w-xl rounded-lg border border-white/10 bg-black/30 p-5">
            <label className="block text-sm text-white/70">
              Admin password
              <input
                type="password"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-white outline-none focus:border-spotify-400"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.currentTarget.value)}
              />
            </label>
            {error ? <div className="mt-4 text-sm text-red-200">{error}</div> : null}
            <button className="mt-5 rounded-lg bg-spotify-500 px-4 py-3 text-sm font-semibold text-black">
              Open Admin
            </button>
          </form>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
            <div className="space-y-6">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={loadState}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold"
                >
                  Refresh
                </button>
              </div>

              {state.sessions.map((session) => (
                <div key={session.id} className="rounded-lg border border-white/10 bg-black/30 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-black">{session.name}</h2>
                      <p className="mt-2 font-mono text-xs text-white/45">{session.id}</p>
                      <p className="mt-2 text-sm text-white/55">
                        {session.visibility} | {session.listenerCount} listeners | {session.queueCount} queued
                      </p>
                      <p className="mt-2 font-mono text-xs text-spotify-200">
                        Host password: {session.hostPassword}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteSession(session.id)}
                      className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100"
                    >
                      Delete Session
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {session.listeners.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-white/45">
                        No connected listeners.
                      </div>
                    ) : (
                      session.listeners.map((listener) => (
                        <div key={listener.socketId} className="rounded-lg border border-white/10 bg-white/5 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="font-semibold">
                                {listener.name} {listener.isHost ? '(host)' : ''}
                              </div>
                              <div className="mt-2 break-all font-mono text-xs text-white/45">
                                IP {listener.ipAddress || 'unknown'} | Visitor {listener.visitorId || 'none'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => ban({ socketId: listener.socketId })}
                              className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100"
                            >
                              Ban User
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <aside className="space-y-6">
              <div className="rounded-lg border border-white/10 bg-black/30 p-5">
                <h2 className="text-xl font-black">Manual Ban</h2>
                <label className="mt-4 block text-sm text-white/70">
                  Reason
                  <input className="mt-2 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-white" value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
                </label>
                <label className="mt-4 block text-sm text-white/70">
                  Display name
                  <input className="mt-2 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-white" value={manualName} onChange={(event) => setManualName(event.currentTarget.value)} />
                </label>
                <label className="mt-4 block text-sm text-white/70">
                  IP address
                  <input className="mt-2 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-white" value={manualIp} onChange={(event) => setManualIp(event.currentTarget.value)} />
                </label>
                <label className="mt-4 block text-sm text-white/70">
                  Visitor ID
                  <input className="mt-2 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-white" value={manualVisitorId} onChange={(event) => setManualVisitorId(event.currentTarget.value)} />
                </label>
                <button
                  type="button"
                  onClick={() => ban({ name: manualName, ipAddress: manualIp, visitorId: manualVisitorId })}
                  className="mt-5 w-full rounded-lg bg-spotify-500 px-4 py-3 text-sm font-semibold text-black"
                >
                  Add Ban
                </button>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 p-5">
                <h2 className="text-xl font-black">Active Bans</h2>
                <div className="mt-4 space-y-3">
                  {state.bans.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-white/45">
                      No bans.
                    </div>
                  ) : (
                    state.bans.map((banRule) => (
                      <div key={banRule.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="font-semibold">{banRule.reason}</div>
                        <div className="mt-2 break-all font-mono text-xs text-white/45">
                          {banRule.name ? `Name ${banRule.name} ` : ''}
                          {banRule.ipAddress ? `IP ${banRule.ipAddress} ` : ''}
                          {banRule.visitorId ? `Visitor ${banRule.visitorId}` : ''}
                        </div>
                        <button
                          type="button"
                          onClick={() => unban(banRule.id)}
                          className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold"
                        >
                          Unban
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
};

export default Admin;
