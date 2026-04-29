import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import publicConfig from '../../publicConfig';

const Banned: NextPage = () => {
  const router = useRouter();
  const reason = typeof router.query.reason === 'string'
    ? router.query.reason
    : 'Banned by site moderation.';

  return (
    <main className="min-h-screen bg-hero-radial text-white">
      <Head>
        <title>Banned - Spotify Listen Together</title>
      </Head>

      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-12">
        <div className="rounded-lg border border-red-400/30 bg-black/35 p-6">
          <div className="text-xs uppercase text-red-200">Access blocked</div>
          <h1 className="mt-3 text-4xl font-black">You are banned</h1>
          <p className="mt-4 text-white/70">
            Reason: {reason}
          </p>
          <a
            href={publicConfig.banAppealUrl}
            className="mt-6 inline-flex rounded-lg bg-spotify-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-spotify-400"
          >
            Contact us for unban
          </a>
        </div>
      </div>
    </main>
  );
};

export default Banned;
