import Link from "next/link";

export const metadata = { title: "Privacy — Lluc Santamaria" };

export default function Privacy() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-6 text-sm">
      <h1 className="text-lg font-bold">/privacy</h1>
      <p className="text-dim">Last updated: 25 October 2026</p>

      <p>
        This site (lluc.sh, digital-lluc) is a personal project run by Lluc
        Santamaria. Questions or deletion requests:{" "}
        <a href="mailto:lluc.santa@gmail.com" className="text-accent hover:underline">
          lluc.santa@gmail.com
        </a>
        .
      </p>

      <h2 className="font-bold">Signing in</h2>
      <p>
        You can sign in with Google or GitHub. I receive your name, email
        address and profile picture. Your email is used to identify you and to
        enforce the daily session limit (a counter that expires after a day).
        Nothing else from your Google or GitHub account is accessed.
      </p>

      <h2 className="font-bold">Talking to digital-lluc</h2>
      <p>
        When you start a voice session, the audio recording and transcript are
        stored privately (Vercel Blob), with session metadata in Upstash Redis,
        linked to your email. Only I can access them. I use them to debug and
        improve digital-lluc, and I delete them on request.
      </p>
      <p>
        To run the conversation, your audio and text are processed by Pipecat
        Cloud and Daily (real-time transport), Deepgram (speech-to-text),
        OpenAI (language model) and Cartesia (text-to-speech), under their own
        privacy policies.
      </p>

      <h2 className="font-bold">Personal tools</h2>
      <p>
        The same Google Cloud project is also used by my own tools, such as
        backing up my own Google Drive. They only access my own account, never
        anyone else&apos;s data.
      </p>

      <h2 className="font-bold">What I don&apos;t do</h2>
      <p>
        No ads, no tracking cookies, and no selling or sharing of your data
        beyond the services listed above.
      </p>

      <p>
        <Link href="/" className="text-accent hover:underline">
          ← back
        </Link>
      </p>
    </main>
  );
}
