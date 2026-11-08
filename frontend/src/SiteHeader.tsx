import Link from "next/link";
import { glassClassName, pressableClassName } from "./glass";
import { ThemeToggle } from "./ThemeToggle";

const navLinkClassName = `rounded-full px-4 py-2 text-sm text-night/80 hover:bg-night/10 hover:text-night dark:text-white/80 dark:hover:bg-white/15 dark:hover:text-white ${pressableClassName}`;

export function SiteHeader() {
  return (
    <header
      className={`sticky top-4 z-10 mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-3xl items-center justify-between gap-2 rounded-full py-2 pr-2 pl-4 ${glassClassName}`}
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 font-bold text-lg tracking-tight"
      >
        <span
          aria-hidden="true"
          className="size-7 rounded-full bg-linear-135 from-cyan-300 via-violet-400 to-fuchsia-400 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
        />
        <span className="max-[359px]:sr-only">lluc.sh</span>
      </Link>
      <nav className="flex items-center gap-1">
        <Link href="/blog" className={navLinkClassName}>
          Blog
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
