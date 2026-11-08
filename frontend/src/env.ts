import { z } from "zod";

const serverEnvSchema = z
  .object({
    BACKEND_URL: z.url(),
    AUTH_TOKEN_SECRET: z.string().min(32),
    LOCAL_DEV_USER_EMAIL: z.email().optional(),
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  })
  .refine(
    (env) =>
      env.VERCEL_ENV !== "production" || env.LOCAL_DEV_USER_EMAIL === undefined,
    {
      message: "LOCAL_DEV_USER_EMAIL must not be set on Vercel production",
    },
  );

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parsed per request rather than at import, so `next build` runs without runtime secrets. */
export function serverEnv(): ServerEnv {
  return serverEnvSchema.parse({
    BACKEND_URL: process.env["BACKEND_URL"],
    AUTH_TOKEN_SECRET: process.env["AUTH_TOKEN_SECRET"],
    LOCAL_DEV_USER_EMAIL: process.env["LOCAL_DEV_USER_EMAIL"] || undefined,
    VERCEL_ENV: process.env["VERCEL_ENV"],
  });
}
