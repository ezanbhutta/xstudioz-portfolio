import { SITE } from '@/config/site';

/**
 * Organization + WebSite nodes, repeated in every page's JSON-LD @graph so
 * per-page references (creator/provider/isPartOf) resolve without needing
 * cross-page @id dereferencing — Google parses structured data per page.
 */
export const ORGANIZATION_ID = `${SITE.url}/#organization`;
export const WEBSITE_ID = `${SITE.url}/#website`;

export function siteGraph() {
  return [
    {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: SITE.name,
      url: `${SITE.url}/`,
      description: SITE.description,
      logo: new URL('/apple-touch-icon.png', SITE.url).href,
      sameAs: [SITE.fiverrUrl],
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: SITE.name,
      url: `${SITE.url}/`,
      publisher: { '@id': ORGANIZATION_ID },
    },
  ];
}
