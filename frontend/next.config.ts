import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { sentryInitOptions } from "./src/sentry-options";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Lets `next dev` serve a browser on another tailnet machine, e.g. the Mac while this laptop runs over SSH.
  allowedDevOrigins: ["**.ts.net"],
};

export default sentryInitOptions === undefined
  ? nextConfig
  : withSentryConfig(nextConfig, {
      telemetry: false,
      silent: true,
      sourcemaps: { disable: true },
      release: { create: false },
      buildTimeInstrumentation: false,
      bundleSizeOptimizations: {
        excludeTracing: true,
        excludeDebugStatements: true,
        excludeReplayIframe: true,
        excludeReplayShadowDom: true,
        excludeReplayWorker: true,
      },
    });
