import type { Metadata } from "next";
import { glassClassName } from "@/glass";

export const metadata: Metadata = { title: "Privacy, Lluc Santamaria" };

export default function Privacy() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <article
        className={`prose-glass rounded-[32px] px-6 py-8 sm:px-10 ${glassClassName}`}
      >
        <h1 className="font-extrabold text-4xl text-night tracking-tighter dark:text-white">
          Privacy
        </h1>
        <p className="text-night/50 text-sm dark:text-white/50">
          Last updated: 8 November 2026
        </p>
        <p>
          This site (lluc.sh, digital-lluc) is a personal project run by Lluc
          Santamaria. Questions or deletion requests:{" "}
          <a href="mailto:lluc.santa@gmail.com">lluc.santa@gmail.com</a>.
        </p>
        <h2>Signing in</h2>
        <p>
          You can sign in with Google or GitHub. I receive your name, email
          address and profile picture. Your email identifies you and enforces
          the daily session limit, a counter in Upstash Redis that expires after
          a day. Nothing else from your Google or GitHub account is accessed.
        </p>
        <h2>Talking to digital-lluc</h2>
        <p>
          Each session's transcript, token usage and, when audio was used, its
          recording are stored privately in Vercel Blob, linked to your email.
          Only I can access them. I use them to debug and improve digital-lluc,
          and I delete them on request.
        </p>
        <p>
          To run the conversation, your audio and text are processed by Pipecat
          Cloud and Daily (real-time transport), Deepgram (speech-to-text),
          OpenAI (language model) and Cartesia (text-to-speech), under their own
          privacy policies.
        </p>
        <p>
          Backend errors are reported to Sentry (error monitoring). These
          reports collect no personal data.
        </p>
        <h2>Personal tools</h2>
        <p>
          The same Google Cloud project is also used by my own tools, such as
          backing up my own Google Drive. They only access my own account, never
          anyone else's data.
        </p>
        <h2>What I don't do</h2>
        <p>
          No ads, no tracking cookies, and no selling or sharing of your data
          beyond the services listed above.
        </p>
      </article>
    </main>
  );
}
