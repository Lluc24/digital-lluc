import Link from "next/link";

const EXTERNAL_LINKS = [
  { label: "GitHub", href: "https://github.com/Lluc24" },
  { label: "LinkedIn", href: "https://linkedin.com/in/lluc-santamaria/" },
  { label: "Email", href: "mailto:lluc.santa@gmail.com" },
] as const;

const linkClassName = "hover:text-night dark:hover:text-white";

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-8 text-night/60 text-sm dark:text-white/60">
      {EXTERNAL_LINKS.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className={linkClassName}
        >
          {link.label}
        </a>
      ))}
      <Link href="/privacy" className={linkClassName}>
        Privacy
      </Link>
      <span>Barcelona</span>
    </footer>
  );
}
