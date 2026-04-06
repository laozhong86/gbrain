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
