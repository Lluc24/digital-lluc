import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts } from "@/lib/blog";

export function generateStaticParams() {
  return listPosts().map((p) => ({ slug: p.slug }));
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <p className="text-sm mb-6">
        <Link href="/blog" className="text-accent hover:underline">
          /blog
        </Link>
        /{post.meta.slug}
      </p>
      <h1 className="text-xl font-bold mb-1">{post.meta.title}</h1>
      <p className="text-dim text-xs mb-8">{post.meta.date}</p>
      <article
        className="prose-terminal space-y-4 text-sm leading-relaxed [&_a]:text-accent [&_a]:underline [&_h2]:font-bold [&_h2]:text-base [&_h2]:mt-6 [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-edge [&_pre]:rounded [&_pre]:p-3 [&_code]:text-accent"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
    </main>
  );
}
