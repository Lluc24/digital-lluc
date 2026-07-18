import Link from "next/link";

const LINKS = [
  { label: "~", href: "/" },
  { label: "/blog", href: "/blog" },
];

export default function Navbar() {
  return (
    <header className="w-full border-b border-edge">
      <nav className="max-w-3xl mx-auto px-3 sm:px-6 py-3 flex gap-1 text-sm">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-accent hover:underline underline-offset-4"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
