import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/sentry-options";

if (sentryInitOptions !== undefined) {
  Sentry.init({
    ...sentryInitOptions,
    integrations: (defaults) =>
      defaults.filter((integration) => integration.name !== "BrowserSession"),
  });
}
