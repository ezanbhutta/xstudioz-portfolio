import type { Category } from '@/data/categories';
import { TYPE_FILTERS } from '@/data/filters';

/**
 * Projects now come from MySQL rather than a content collection, so that an
 * edit is live on the next request instead of the next build. The shape is
 * unchanged, which is why everything below this line — and every component
 * that consumes it — did not have to move.
 */
export { getSortedProjects } from './content';
export type { Project, ReadyProject, ProjectData, ProjectImage } from './content';

import type { Project, ReadyProject } from './content';

/**
 * A meta description that fits.
 *
 * Search results cut around 155–160 characters, and a description that is
 * chopped mid-word is a worse first impression than a shorter one. Trims on a
 * word boundary and never leaves dangling punctuation.
 */
export function metaDescription(...parts: (string | undefined)[]): string {
  const text = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= 158) return text;
  const cut = text.slice(0, 158);
  const at = cut.lastIndexOf(' ');
  return `${(at > 100 ? cut.slice(0, at) : cut).replace(/[\s,;:—-]+$/, '')}…`;
}

/** Preset + custom extra elements, in the order they were entered. */
export function projectExtras(data: Project['data']): string[] {
  return [...(data.extras ?? []), ...(data.extrasCustom ?? [])];
}

/**
 * What this project shipped, for the case study's deliverables list.
 *
 * Uses the explicit `delivered` list when one is written. Otherwise it is
 * derived from data that already exists and is already true: the project's
 * own type (Full Brand Guidelines, Combination logo…) plus whatever extras
 * were recorded. Nothing here is inferred or invented.
 */
export function projectDeliverables(data: Project['data']): string[] {
  if (data.delivered?.length) return data.delivered;
  const kind = data.guidelineType ?? (data.logoType && `${data.logoType} logo`);
  return [kind, ...projectExtras(data)].filter((x): x is string => Boolean(x));
}

/**
 * Work to show on a service page.
 *
 * A project belongs to a service when it is tagged with that category, and
 * *also* when it carried the service as an add-on, via `relatedExtras`. Both
 * live services list no extras today, so the second path returns nothing —
 * it stays because it is the mechanism that lets a future service show real
 * work from day one instead of an empty grid.
 */
export function projectsForService(
  projects: ReadyProject[],
  category: Category,
): { direct: ReadyProject[]; viaExtras: ReadyProject[] } {
  const extras = new Set(category.relatedExtras ?? []);
  const direct = projects.filter((p) => p.data.category === category.id);
  const viaExtras =
    extras.size === 0
      ? []
      : projects.filter(
          (p) =>
            p.data.category !== category.id && projectExtras(p.data).some((e) => extras.has(e)),
        );
  return { direct, viaExtras };
}

/** Previous/next neighbours in the overall sequence, wrapping at the ends. */
export function adjacentProjects(
  projects: ReadyProject[],
  id: string,
): { prev: ReadyProject | null; next: ReadyProject | null } {
  const i = projects.findIndex((p) => p.id === id);
  const n = projects.length;
  // A lone project (or an unknown id) has no meaningful neighbours.
  if (n < 2 || i === -1) return { prev: null, next: null };
  return {
    prev: projects[(i - 1 + n) % n] ?? null,
    next: projects[(i + 1) % n] ?? null,
  };
}

/**
 * The project's type within its OWN service's taxonomy.
 *
 * Both fields can be set at once — a Full Brand Guidelines project is also
 * built around a Lettermark — so this cannot just take the first non-empty
 * one. A guidelines project filed under "Lettermark" is unfindable by the
 * control a buyer would actually reach for, which is what the Type dropdown
 * on the service page is filtering by.
 */
export function projectType(data: Project['data']): string | undefined {
  const key = TYPE_FILTERS[data.category]?.key;
  return key ? data[key] : undefined;
}

/**
 * A type the project carries that isn't its own category's — the logo type
 * behind a guidelines project. Worth showing on the case study as detail; not
 * a filter, because it would make one project answer to two taxonomies.
 */
export function secondaryType(data: Project['data']): string | undefined {
  const key = TYPE_FILTERS[data.category]?.key;
  if (key === 'logoType') return undefined;
  return data.logoType;
}

/** Distinct industries across a set of projects, alphabetical. */
export function industriesOf(projects: Project[]): string[] {
  const set = new Set<string>();
  for (const p of projects) if (p.data.industry) set.add(p.data.industry);
  return [...set].sort((a, b) => a.localeCompare(b));
}
