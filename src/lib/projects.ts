import { getCollection, type CollectionEntry } from 'astro:content';
import type { CategoryId } from '@/data/categories';

export type Project = CollectionEntry<'projects'>;

/** All projects in display order (curated `order`, then newest, then A–Z). */
export async function getSortedProjects(): Promise<Project[]> {
  const all = await getCollection('projects');
  return all.sort(
    (a, b) =>
      a.data.order - b.data.order ||
      b.data.year - a.data.year ||
      a.data.title.localeCompare(b.data.title),
  );
}

/** Previous/next neighbours in the overall sequence, wrapping at the ends. */
export function adjacentProjects(
  projects: Project[],
  id: string,
): { prev: Project | null; next: Project | null } {
  const i = projects.findIndex((p) => p.id === id);
  const n = projects.length;
  // A lone project (or an unknown id) has no meaningful neighbours.
  if (n < 2 || i === -1) return { prev: null, next: null };
  return {
    prev: projects[(i - 1 + n) % n] ?? null,
    next: projects[(i + 1) % n] ?? null,
  };
}

export function countByCategory(projects: Project[]): Partial<Record<CategoryId, number>> {
  const counts: Partial<Record<CategoryId, number>> = {};
  for (const p of projects) {
    counts[p.data.category] = (counts[p.data.category] ?? 0) + 1;
  }
  return counts;
}
