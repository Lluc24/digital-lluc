import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Lets `next dev` serve a browser on another tailnet machine, e.g. the Mac while this laptop runs over SSH.
  allowedDevOrigins: ["**.ts.net"],
};

export default nextConfig;
