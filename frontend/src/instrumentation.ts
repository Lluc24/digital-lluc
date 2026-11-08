import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/sentry-options";

export async function register(): Promise<void> {
  if (sentryInitOptions === undefined) {
    return;
  }
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    await import("@/sentry.server.config");
  }
  if (process.env["NEXT_RUNTIME"] === "edge") {
    await import("@/sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
