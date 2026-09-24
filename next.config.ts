import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  trailingSlash: true,
  async redirects() {
    return [
      {
        source: "/jj",
        destination: "https://jj.orbitalpha.kr",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/futures-paper",
          destination: "https://paper-api.orbitalpha.kr/monitor/index.html",
        },
        {
          source: "/futures-paper/",
          destination: "https://paper-api.orbitalpha.kr/monitor/index.html",
        },
        {
          source: "/futures-paper/:path*",
          destination: "https://paper-api.orbitalpha.kr/monitor/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
