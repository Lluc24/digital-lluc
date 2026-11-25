import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { sentryInitOptions } from "./src/sentry-options";

const nextConfig: NextConfig = {
  typedRoutes: true,
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
