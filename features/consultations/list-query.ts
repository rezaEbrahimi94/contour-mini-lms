// How a list page is asked for in a URL: ?page=2 and, on the dashboard,
// ?view=history. A query-string key can repeat, so Next.js may hand a page an
// array. The first value counts.

/** Upcoming is from now on, earliest first. History is the past, latest first. */
export type Period = "upcoming" | "history";

type QueryValue = string | string[] | null | undefined;

const firstValue = (value: QueryValue) =>
  Array.isArray(value) ? value[0] : value;

// Keeps the row offset far inside PostgreSQL's integer range.
const maxPage = 1_000_000;

export function pageNumber(value: QueryValue): number {
  const page = Number(firstValue(value) ?? undefined);
  return Number.isSafeInteger(page) && page > 0 && page <= maxPage ? page : 1;
}

export function period(value: QueryValue): Period {
  return firstValue(value) === "history" ? "history" : "upcoming";
}
