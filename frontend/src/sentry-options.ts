import { z } from "zod";

const sentryEnvSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
});

const { NEXT_PUBLIC_SENTRY_DSN: sentryDsn } = sentryEnvSchema.parse({
  NEXT_PUBLIC_SENTRY_DSN: process.env["NEXT_PUBLIC_SENTRY_DSN"] || undefined,
});

/** Undefined when NEXT_PUBLIC_SENTRY_DSN is unset, so Sentry stays off in local dev. */
export const sentryInitOptions =
  sentryDsn === undefined
    ? undefined
    : ({ dsn: sentryDsn, sendDefaultPii: false } as const);
