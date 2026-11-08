import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Lets `next dev` serve a browser on another tailnet machine, e.g. the Mac while this laptop runs over SSH.
  allowedDevOrigins: ["**.ts.net"],
};

export default withSentryConfig(nextConfig, {
  telemetry: false,
  silent: true,
  sourcemaps: { disable: true },
  bundleSizeOptimizations: {
    excludeTracing: true,
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
});
