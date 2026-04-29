import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envCandidates = Array.from(new Set([
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'spotify-listen-together-server', '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
]));

export const loadedEnvPath = envCandidates.find((envPath) => fs.existsSync(envPath)) || '';

if (loadedEnvPath) {
  dotenv.config({ path: loadedEnvPath });
  console.log(`Loaded environment from ${loadedEnvPath}`);
}
