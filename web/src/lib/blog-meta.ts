// Pure helpers for blog posts. No fs or Next imports, so they can be tested.

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  summary?: string;
}

/** A slug is a file name inside content/blog: letters, digits, dashes, underscores only. */
export function isValidSlug(slug: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug);
}

/**
 * Front matter dates may reach us as a string ("2026-08-05") or, when the
 * YAML value is unquoted, as a Date. Rendering a Date as a React child
 * throws and would take down the whole blog index, so always return a string.
 */
export function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  return typeof value === "string" ? value : "";
}

export function toPostMeta(slug: string, data: Record<string, unknown>): PostMeta {
  return {
    slug,
    title: typeof data.title === "string" && data.title ? data.title : slug,
    date: normalizeDate(data.date),
    summary: typeof data.summary === "string" ? data.summary : undefined,
  };
}
