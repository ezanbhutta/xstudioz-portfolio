import { getCollection, type CollectionEntry } from 'astro:content';

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
export function adjacentProjects(projects: Project[], id: string) {
  const i = projects.findIndex((p) => p.id === id);
  const n = projects.length;
  return {
    prev: projects[(i - 1 + n) % n],
    next: projects[(i + 1) % n],
  };
}

export function countByCategory(projects: Project[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of projects) {
    counts[p.data.category] = (counts[p.data.category] ?? 0) + 1;
  }
  return counts;
}
