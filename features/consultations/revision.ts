import { revisionSchema, type Revision } from "./contracts.ts";

// HTTP carries a booking revision as a strong entity tag: the revision UUID
// in double quotes. The API sends it in ETag and expects it back in If-Match.

export function entityTag(revision: string) {
  return `"${revision}"`;
}

/** The revision inside one strong, quoted entity tag, or null for anything else. */
export function revisionFromEntityTag(tag: string | null): Revision | null {
  if (tag === null || !tag.startsWith('"') || !tag.endsWith('"')) return null;
  const text = tag.slice(1, -1);
  // The database writes lowercase. An exact match keeps one spelling per revision.
  if (text !== text.toLowerCase()) return null;
  const revision = revisionSchema.safeParse(text);
  return revision.success ? revision.data : null;
}
