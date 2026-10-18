import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import { isValidSlug, toPostMeta, type PostMeta } from "./blog-meta";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export type { PostMeta };

export function listPosts(): PostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(BLOG_DIR, f), "utf-8");
      const { data } = matter(raw);
      return toPostMeta(f.replace(/\.md$/, ""), data);
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): { meta: PostMeta; html: string } | null {
  // Never build a path from an unchecked slug: "../" would read files outside content/blog.
  if (!isValidSlug(slug)) return null;
  const file = path.join(BLOG_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  const { data, content } = matter(raw);
  return {
    meta: toPostMeta(slug, data),
    html: marked.parse(content, { async: false }),
  };
}
