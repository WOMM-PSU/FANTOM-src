import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@fantom/shared"],
  // Phones on the LAN reach the dev server by IP, which Next treats as a
  // cross-origin dev host. This applies to development only.
  allowedDevOrigins: ["**", "127.0.0.1"],
};

export default nextConfig;
