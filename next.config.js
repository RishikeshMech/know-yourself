const path = require('path')

/**
 * @supabase/supabase-js is an OPTIONAL backend integration (see README —
 * without Supabase env vars the app runs in fully local demo mode). A stale or
 * partial `node_modules` (e.g. deps installed before this package was added)
 * used to hard-crash compilation with "Module not found: Can't resolve
 * '@supabase/supabase-js'" the moment any page imports lib/supabase.ts.
 *
 * When the package is not installed we alias it to a local stub so the app
 * still compiles and runs in demo mode; lib/supabase.ts catches the stub's
 * error and falls back gracefully. When it IS installed, no alias is applied
 * and the real client (types included) is used unchanged.
 */
let supabaseAlias = {}
try {
  require.resolve('@supabase/supabase-js')
} catch {
  supabaseAlias = {
    '@supabase/supabase-js': path.join(__dirname, 'lib/supabase-js.stub.ts'),
  }
}

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
    // pdf-parse/mammoth ship CJS that must not be webpack-bundled for API routes.
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth'],
  },
  webpack: (config) => {
    // Apply only when the real package is missing from node_modules.
    if (Object.keys(supabaseAlias).length > 0) {
      config.resolve.alias = { ...config.resolve.alias, ...supabaseAlias }
    }
    return config
  },
}

module.exports = nextConfig
