import { z } from "zod";
import { auth } from "@/auth";
import { serverEnv } from "@/env";
import { HTTP_STATUS_BY_SESSION_START, type SessionStart } from "@/session";
import { startBackendSession } from "@/session-api";

const signedInEmailSchema = z.email();

async function visitorEmail(
  localDevUserEmail: string | undefined,
): Promise<string | undefined> {
  const session = await auth();
  const signedInEmail = signedInEmailSchema.safeParse(session?.user?.email);
  return (
    localDevUserEmail ??
    (signedInEmail.success ? signedInEmail.data : undefined)
  );
}

export async function POST(): Promise<Response> {
  const env = serverEnv();
  const email = await visitorEmail(env.LOCAL_DEV_USER_EMAIL);
  const sessionStart: SessionStart = email
    ? await startBackendSession(env, email, new Date())
    : { kind: "sign-in-required" };
  console.info(
    `🎟️ /api/sessions: ${sessionStart.kind}${email ? ` for ${email}` : ""}`,
  );
  return Response.json(sessionStart, {
    status: HTTP_STATUS_BY_SESSION_START[sessionStart.kind],
  });
}
