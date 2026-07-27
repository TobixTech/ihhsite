/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['better-auth', '@better-auth/kysely-adapter', 'kysely', 'pg'],
}

export default nextConfig
