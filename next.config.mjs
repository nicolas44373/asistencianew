import withPWA from 'next-pwa'

/** @type {import('next').NextConfig} */
const baseConfig = {
  experimental: {},
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}

const withPWAConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Estrategia NetworkFirst para la API de fichaje
  runtimeCaching: [
    {
      urlPattern: /^\/api\/fichar/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-fichar',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
        backgroundSync: {
          name: 'fichar-offline',
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    {
      urlPattern: /^\/api\//,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
      },
    },
    {
      urlPattern: /\/_next\/static\//,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\//,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
  ],
})

export default withPWAConfig(baseConfig)
