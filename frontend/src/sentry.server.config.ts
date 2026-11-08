import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/sentry-options";

if (sentryInitOptions !== undefined) {
  Sentry.init({
    ...sentryInitOptions,
    // Same Http replacement the SDK makes for Next.js, minus release-health sessions.
    integrations: (defaults) => [
      ...defaults.filter(
        (integration) =>
          integration.name !== "Http" && integration.name !== "ProcessSession",
      ),
      Sentry.httpIntegration({
        disableIncomingRequestSpans: true,
        sessions: false,
      }),
    ],
  });
}
