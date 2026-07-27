/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Required to run instrumentation.ts (DB migration) before the first request
  instrumentationHook: true,
  serverExternalPackages: ['better-auth', '@better-auth/kysely-adapter', 'kysely', 'pg'],
}

export default nextConfig
