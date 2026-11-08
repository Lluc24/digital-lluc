"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/** Next's own error boundary swallows render errors, so report them before showing its default page. */
export default function GlobalError({ error }: { error: unknown }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={500} />
      </body>
    </html>
  );
}
