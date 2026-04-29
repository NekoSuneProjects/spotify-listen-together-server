import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import publicConfig from '../../publicConfig';

function selectCodeBlock(target: HTMLDivElement) {
  if (!window.getSelection) {
    return;
  }

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(target);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function CopyCommandCard(props: {
  platform: string;
  subtitle: string;
  command: string;
  steps: string[];
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-white/40">
            Automatic Install
          </div>
          <h2 className="mt-2 text-2xl font-black text-white">{props.platform}</h2>
          <p className="mt-2 text-sm text-white/55">{props.subtitle}</p>
        </div>
        <span className="rounded-full border border-spotify-400/20 bg-spotify-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-spotify-200">
          Copy Ready
        </span>
      </div>

      <ol className="mb-5 space-y-2 text-sm leading-7 text-white/70">
        {props.steps.map((step, index) => (
          <li key={index}>
            <span className="mr-2 text-spotify-300">{index + 1}.</span>
            {step}
          </li>
        ))}
      </ol>

      <div
        className="cursor-pointer overflow-x-auto rounded-2xl border border-spotify-400/20 bg-black/35 px-4 py-4 font-mono text-sm text-spotify-100 transition hover:border-spotify-400/45 hover:bg-black/50"
        onClick={(e) => {
          navigator.clipboard.writeText(props.command);
          selectCodeBlock(e.currentTarget);
        }}
      >
        {props.command}
      </div>
    </div>
  );
}

const Instructions: NextPage = () => {
  const [serverUrl, setServerUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setServerUrl(`${window.location.protocol}//${window.location.host}`);
    }
  }, []);

  const repoURL = `https://github.com/NekoSuneProjects/spotify-listen-together`;
  const listenTogetherURL = `${repoURL}/releases/latest/download/listenTogether.js`;
  const windowsInstallCMD = `iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex`;
  const unixInstallCMD = `curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh`;

  return (
    <main className="min-h-screen bg-hero-radial text-white">
      <Head>
        <title>Install Spotify Listen Together</title>
      </Head>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_center,rgba(29,185,84,0.18),transparent_55%)] blur-3xl" />

        <header className="mb-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur sm:p-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-spotify-400/30 bg-spotify-500/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-spotify-200">
            <span className="h-2 w-2 rounded-full bg-spotify-400" />
            Client Setup
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            Install <span className="text-spotify-400">Spotify Listen Together</span>
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/70 sm:text-base">
            Pick your platform, run the install command, or use the manual extension path if you want full control.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-spotify-400/40 hover:bg-white/10"
            >
              Back To Dashboard
            </Link>
            <a
              href={listenTogetherURL}
              className="rounded-2xl bg-spotify-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-spotify-400"
            >
              Download listenTogether.js
            </a>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <CopyCommandCard
            platform="Windows"
            subtitle="Installs Spicetify with the PowerShell bootstrapper."
            command={windowsInstallCMD}
            steps={[
              'Press WIN + R.',
              'Type "PowerShell" and press ENTER.',
              'Paste the command below.',
            ]}
          />
          <CopyCommandCard
            platform="Linux"
            subtitle="Uses the Spicetify shell installer from Terminal."
            command={unixInstallCMD}
            steps={['Open Terminal.', 'Paste the command below.']}
          />
          <CopyCommandCard
            platform="macOS"
            subtitle="Uses the same Spicetify shell installer from Terminal."
            command={unixInstallCMD}
            steps={['Open Terminal.', 'Paste the command below.']}
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur sm:p-8">
            <div className="text-xs uppercase tracking-[0.24em] text-white/40">
              Manual Install
            </div>
            <h2 className="mt-2 text-3xl font-black text-white">Extension Path Setup</h2>
            <div className="mt-6 space-y-5 text-sm leading-7 text-white/70">
              <p>
                <span className="mr-2 text-spotify-300">1.</span>
                Download and install{' '}
                <a
                  href="https://spicetify.app/docs/getting-started"
                  className="font-semibold text-spotify-200 hover:text-spotify-100"
                >
                  Spicetify
                </a>
                .
              </p>
              <p>
                <span className="mr-2 text-spotify-300">2.</span>
                Download{' '}
                <a
                  href={listenTogetherURL}
                  className="font-semibold text-spotify-200 hover:text-spotify-100"
                >
                  listenTogether.js
                </a>
                .
              </p>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/35">Extensions Folder</p>
                <div className="mt-3 space-y-2 font-mono text-xs text-white/75 sm:text-sm">
                  <div>Windows: %appdata%\spicetify\Extensions\</div>
                  <div>Linux / macOS: ~/.config/spicetify/Extensions/</div>
                </div>
              </div>
              <p>
                <span className="mr-2 text-spotify-300">3.</span>
                Put <span className="font-mono text-white">listenTogether.js</span> into the extensions folder.
              </p>
              <div className="rounded-2xl border border-spotify-400/20 bg-black/35 p-4 font-mono text-xs text-spotify-100 sm:text-sm">
                spicetify config extensions listenTogether.js
                <br />
                spicetify backup
                <br />
                spicetify apply
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-spotify-500/15 via-white/5 to-transparent p-6 backdrop-blur sm:p-8">
            <div className="text-xs uppercase tracking-[0.24em] text-white/40">
              Server Info
            </div>
            <h2 className="mt-2 text-3xl font-black text-white">Join Details</h2>
            <div className="mt-6 space-y-4 text-sm leading-7 text-white/70">
              <p>After install, open the Listen Together menu in Spotify and choose <span className="font-semibold text-white">Join a server</span>.</p>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">Server URL</div>
                <div className="mt-2 break-all font-mono text-sm text-spotify-100">
                  {serverUrl || 'This value appears when opened in the browser.'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">Recommended Client</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  v{publicConfig.clientRecommendedVersion}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur sm:p-8">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-[0.24em] text-white/40">
              After Installation
            </div>
            <h2 className="mt-2 text-3xl font-black text-white">Connect In Spotify</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60">
              The setup flow inside Spotify should feel obvious. These screenshots make the join flow explicit.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4">
              <div className="mb-3 text-sm font-semibold text-spotify-200">1. Open the Listen Together menu</div>
              <img
                src="/images/Instruction1.png"
                alt="Open the Listen Together menu"
                className="w-full rounded-2xl border border-white/10 bg-black/30"
              />
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4">
              <div className="mb-3 text-sm font-semibold text-spotify-200">2. Select &quot;Join a server&quot;</div>
              <img
                src="/images/Instruction2.png"
                alt="Select Join a server"
                className="w-full rounded-2xl border border-white/10 bg-black/30"
              />
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4">
              <div className="mb-3 text-sm font-semibold text-spotify-200">3. Enter the URL and your name</div>
              <div className="relative">
                <img
                  src="/images/Instruction3.png"
                  alt="Enter the server URL and your name"
                  className="w-full rounded-2xl border border-white/10 bg-black/30"
                />
                <span className="absolute left-[39.7%] top-[54.8%] w-[47%] overflow-hidden text-[10px] font-bold tracking-[0.4px] text-white sm:text-[12px]">
                  {serverUrl}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Instructions;
