/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow preview host
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ]
  },
  experimental: {
    serverActions: { allowedOrigins: ['*'] },
  },
}

module.exports = nextConfig
