import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import { newestFirst, type PostMeta, postFrontMatterSchema } from "./blog-post";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");
const MARKDOWN_EXTENSION = ".md";

function readPostFile(slug: string): { meta: PostMeta; markdown: string } {
  const { data, content } = matter(
    fs.readFileSync(
      path.join(BLOG_DIR, `${slug}${MARKDOWN_EXTENSION}`),
      "utf-8",
    ),
  );
  const frontMatter = postFrontMatterSchema.safeParse(data);
  if (frontMatter.success) {
    return { meta: { ...frontMatter.data, slug }, markdown: content };
  }
  throw new Error(
    `content/blog/${slug}.md has invalid front matter: ${frontMatter.error.message}`,
  );
}

export function listPosts(): PostMeta[] {
  return newestFirst(
    fs
      .readdirSync(BLOG_DIR)
      .filter((fileName) => fileName.endsWith(MARKDOWN_EXTENSION))
      .map(
        (fileName) =>
          readPostFile(path.basename(fileName, MARKDOWN_EXTENSION)).meta,
      ),
  );
}

/** Pre: slug comes from listPosts(); the route sets dynamicParams = false to guarantee it. */
export function readPost(slug: string): { meta: PostMeta; html: string } {
  const { meta, markdown } = readPostFile(slug);
  return { meta, html: marked.parse(markdown, { async: false }) };
}
