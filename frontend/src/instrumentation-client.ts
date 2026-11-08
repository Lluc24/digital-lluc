import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/sentry-options";

if (sentryInitOptions !== undefined) {
  Sentry.init({
    ...sentryInitOptions,
    // Release-health sessions are not errors, and their envelopes ask Sentry to infer the visitor's IP.
    integrations: (defaults) =>
      defaults.filter((integration) => integration.name !== "BrowserSession"),
  });
}
