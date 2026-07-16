import Console from "@/components/Console";

const LINKS = [
  { label: "github", href: "https://github.com/Lluc24" },
  { label: "linkedin", href: "https://linkedin.com/in/lluc-santamaria/" },
  { label: "email", href: "mailto:lluc.santa@gmail.com" },
  { label: "linktree", href: "https://linktr.ee/lluc_santamaria" },
];

export default function Home() {
  return (
    <main className="flex flex-col flex-1 items-center px-3 py-4 sm:px-6 sm:py-8 gap-4">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
        <header className="w-full flex flex-col items-center text-center gap-2">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Lluc Santamaria Riba
            </h1>
            <p className="text-sm text-dim">
              AI Engineer @ Prosper AI · voice agents that talk to real people,
              in real time
            </p>
          </div>
          <nav className="flex gap-3 text-sm">
            {LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline underline-offset-4"
              >
                [{l.label}]
              </a>
            ))}
          </nav>
        </header>

        <Console />

        <footer className="w-full text-xs text-dim flex flex-wrap justify-between gap-2">
          <span>
            digital-lluc is an AI version of me — enjoy it, then check the
            real record on LinkedIn.
          </span>
          <span>Barcelona, Spain</span>
        </footer>
      </div>
    </main>
  );
}
