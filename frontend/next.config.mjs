/** @type {import('next').NextConfig} */
const backendUrl = (process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * The API is proxied through the Next.js origin rather than called directly
   * from the browser. That keeps the session cookie same-origin (so it is never
   * a third-party cookie) and means the backend never has to relax CORS.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
