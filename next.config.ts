import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: "/jj",
        destination: "https://jj.orbitalpha.kr",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
