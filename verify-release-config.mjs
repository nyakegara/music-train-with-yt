import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
if (!packageJson.scripts?.['dist:win']?.includes('--publish never')) {
  console.error('Windows installer builds must use --publish never; release publishing is handled separately.');
  process.exit(1);
}

const endpoint = process.env.VITE_ELIGIBILITY_API?.trim();

if (!endpoint) {
  console.error('VITE_ELIGIBILITY_API is required to build a Windows release.');
  process.exit(1);
}

try {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('The endpoint must use HTTPS and cannot include credentials, a query, or a fragment.');
  }
} catch (error) {
  console.error(`Invalid VITE_ELIGIBILITY_API: ${error instanceof Error ? error.message : 'expected an HTTPS URL'}`);
  process.exit(1);
}
