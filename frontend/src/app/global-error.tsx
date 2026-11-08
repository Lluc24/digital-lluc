"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/**
 * Next's own error boundary swallows render errors, so report them before showing its default page.
 * Server Component errors arrive with a digest and were already reported by onRequestError.
 */
export default function GlobalError({ error }: { error: unknown }) {
  useEffect(() => {
    if (!(error instanceof Error && "digest" in error)) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
