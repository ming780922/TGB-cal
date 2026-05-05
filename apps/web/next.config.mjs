import createNextIntlPlugin from 'next-intl/plugin';
import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

if (process.env.NODE_ENV === 'development') {
  await setupDevPlatform({
    persistTo: path.resolve(__dirname, '../../.wrangler/state')
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloudflare Pages
};

export default withNextIntl(nextConfig);
