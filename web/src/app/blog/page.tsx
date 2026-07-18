import Link from "next/link";
import { listPosts } from "@/lib/blog";

export const metadata = { title: "Blog — Lluc Santamaria" };

export default function BlogIndex() {
  const posts = listPosts();
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-lg font-bold">/blog</h1>
      {posts.length === 0 && (
        <p className="text-dim text-sm">
          Nothing here yet — the first post is being written. Meanwhile,{" "}
          <Link href="/" className="text-accent hover:underline">
            talk to digital-lluc
          </Link>
          .
        </p>
      )}
      <ul className="space-y-4">
        {posts.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/blog/${p.slug}`}
              className="text-accent hover:underline"
            >
              {p.title}
            </Link>
            <span className="text-dim text-xs ml-2">{p.date}</span>
            {p.summary && <p className="text-sm text-dim">{p.summary}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
