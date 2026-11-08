import type { Metadata } from "next";
import Link from "next/link";
import { listPosts } from "@/blog";
import { glassClassName, pressableClassName } from "@/glass";

export const metadata: Metadata = { title: "Blog, Lluc Santamaria" };

export default function BlogIndex() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="font-extrabold text-5xl tracking-tighter">Blog</h1>
      <ul className="flex flex-col gap-4">
        {listPosts().map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className={`flex flex-col gap-1.5 rounded-3xl px-6 py-5 ${glassClassName} ${pressableClassName}`}
            >
              <time
                dateTime={post.date}
                className="text-night/50 text-sm dark:text-white/50"
              >
                {post.date}
              </time>
              <span className="font-semibold text-xl tracking-tight">
                {post.title}
              </span>
              <span className="text-night/70 dark:text-white/70">
                {post.summary}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
