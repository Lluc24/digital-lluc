import type { Metadata } from "next";
import Link from "next/link";
import { listPosts, readPost } from "@/blog";
import { glassClassName } from "@/glass";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return listPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { meta } = readPost((await params).slug);
  return {
    title: `${meta.title}, Lluc Santamaria`,
    description: meta.summary,
    openGraph: {
      type: "article",
      title: meta.title,
      description: meta.summary,
      publishedTime: meta.date,
    },
  };
}

export default async function BlogPost({ params }: PageProps<"/blog/[slug]">) {
  const { meta, html } = readPost((await params).slug);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <Link
        href="/blog"
        className="text-night/60 text-sm hover:text-night dark:text-white/60 dark:hover:text-white"
      >
        ← Blog
      </Link>
      <article
        className={`flex flex-col gap-6 rounded-[32px] px-6 py-8 sm:px-10 ${glassClassName}`}
      >
        <header className="flex flex-col gap-2">
          <time
            dateTime={meta.date}
            className="text-night/50 text-sm dark:text-white/50"
          >
            {meta.date}
          </time>
          <h1 className="font-extrabold text-4xl tracking-tighter">
            {meta.title}
          </h1>
        </header>
        <div
          className="prose-glass"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered at build time from our own content/blog markdown.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </main>
  );
}
