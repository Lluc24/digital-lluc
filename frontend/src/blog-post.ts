import { z } from "zod";

export const postFrontMatterSchema = z.object({
  title: z.string().min(1),
  // YAML parses an unquoted date into a Date; quoted, it stays a string.
  date: z.union([
    z.iso.date(),
    z.date().transform((date) => date.toISOString().slice(0, 10)),
  ]),
  summary: z.string().min(1),
});

export type PostMeta = z.infer<typeof postFrontMatterSchema> & {
  readonly slug: string;
};

export function newestFirst(posts: readonly PostMeta[]): PostMeta[] {
  return posts.toSorted((first, second) =>
    second.date.localeCompare(first.date),
  );
}
