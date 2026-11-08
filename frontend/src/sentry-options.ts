import type * as Sentry from "@sentry/nextjs";
import { z } from "zod";

const sentryEnvSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
});

const { NEXT_PUBLIC_SENTRY_DSN: sentryDsn } = sentryEnvSchema.parse({
  NEXT_PUBLIC_SENTRY_DSN: process.env["NEXT_PUBLIC_SENTRY_DSN"] || undefined,
});

/**
 * Errors only, with no personal data: Sentry 11 collects user info, cookies, headers,
 * bodies and query strings unless told otherwise, and console logs may hold an email.
 * Undefined when NEXT_PUBLIC_SENTRY_DSN is unset, so Sentry stays off in local dev.
 */
export const sentryInitOptions =
  sentryDsn === undefined
    ? undefined
    : ({
        dsn: sentryDsn,
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          graphQL: { document: false, variables: false },
          genAI: { inputs: false, outputs: false },
          mcp: { inputs: false, outputs: false },
          databaseQueryData: false,
          queues: false,
          stackFrameVariables: false,
        },
        tracePropagationTargets: [],
        beforeBreadcrumb: (breadcrumb) =>
          breadcrumb.category === "console" ? null : breadcrumb,
      } satisfies Parameters<typeof Sentry.init>[0]);
