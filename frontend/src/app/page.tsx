import { Conversation } from "@/Conversation";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="bg-linear-to-br from-night via-night to-night/40 bg-clip-text font-extrabold text-5xl text-transparent tracking-tighter sm:text-7xl dark:from-white dark:via-white dark:to-white/40">
          Lluc Santamaria
        </h1>
        <p className="max-w-lg text-lg text-night/70 dark:text-white/70">
          AI engineer at Prosper AI, building voice agents that talk to real
          people in real time. Ask the AI version of me anything.
        </p>
      </div>
      <Conversation />
    </main>
  );
}
