import { getCollection, type CollectionEntry } from 'astro:content';
import type { CategoryId } from '@/data/categories';

export type Project = CollectionEntry<'projects'>;

/** A project whose visuals exist (ingest has run, or images were provided). */
export type ReadyProject = Project & {
  data: Project['data'] & {
    cover: NonNullable<Project['data']['cover']>;
    images: NonNullable<Project['data']['images']>;
  };
};

/**
 * All displayable projects in order (curated `order`, then A–Z). Entries
 * without visuals yet (e.g. a CMS entry saved without a PDF or images) are
 * skipped with a build warning instead of breaking the site.
 */
export async function getSortedProjects(): Promise<ReadyProject[]> {
  const all = await getCollection('projects');
  const ready = all.filter((p): p is ReadyProject =>
    Boolean(p.data.cover && p.data.images?.length),
  );
  for (const p of all) {
    if (!ready.includes(p as ReadyProject)) {
      console.warn(
        `[projects] "${p.id}" skipped: no visuals yet. Upload a PDF (the build renders it) or add images in the CMS.`,
      );
    }
  }
  return ready.sort(
    (a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title),
  );
}

/** Distinct industries per category, for each category's Industry filter. */
export function industriesByCategory(projects: Project[]): Partial<Record<CategoryId, string[]>> {
  const sets = new Map<CategoryId, Set<string>>();
  for (const p of projects) {
    if (!p.data.industry) continue;
    const set = sets.get(p.data.category) ?? new Set<string>();
    set.add(p.data.industry);
    sets.set(p.data.category, set);
  }
  const out: Partial<Record<CategoryId, string[]>> = {};
  for (const [category, set] of sets) {
    out[category] = [...set].sort((a, b) => a.localeCompare(b));
  }
  return out;
}

/** Preset + custom extra elements, in the order they were entered. */
export function projectExtras(data: Project['data']): string[] {
  return [...(data.extras ?? []), ...(data.extrasCustom ?? [])];
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
