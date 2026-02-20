/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/ws/:path*",
        destination: `${process.env.NEXT_PUBLIC_WS_BACKEND_HTTP || "http://localhost:8000"}/:path*`,
      },
      {
        source: "/api/ingest/:path*",
        destination: `${process.env.NEXT_PUBLIC_INGEST_BACKEND || "http://localhost:8001"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
