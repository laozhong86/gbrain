export const PAGE_TYPES = [
  "person",
  "company",
  "deal",
  "yc",
  "civic",
  "project",
  "concept",
  "source",
  "media",
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

export const PAGE_TYPE_SQL_LIST = PAGE_TYPES.map((value) => `'${value}'`).join(", ");

export function isPageType(value: string): value is PageType {
  return PAGE_TYPES.includes(value as PageType);
}

export interface PageRecord {
  id: number;
  slug: string;
  type: PageType;
  title: string;
  compiledTruth: string;
  timeline: string;
  frontmatter: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageUpsertInput {
  slug: string;
  type: PageType;
  title: string;
  compiledTruth: string;
  timeline: string;
  frontmatter: string;
}

export interface ListPagesOptions {
  type?: PageType;
  tag?: string;
  limit?: number;
}
