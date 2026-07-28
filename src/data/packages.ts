import { SITE } from '@/config/site';

/**
 * Service packages shown on /packages/.
 * Edit copy, pricing and inclusions here — the page renders from this data.
 */
export interface Package {
  id: string;
  name: string;
  /** One-line promise, shown under the name. */
  summary: string;
  /** Display price. Keep as text so currency/format stays flexible. */
  price: string;
  delivery: string;
  revisions: string;
  /** Ordered list of everything included. */
  includes: string[];
  /** Marks the recommended tier. Exactly one package should set this. */
  highlighted?: boolean;
  /** Destination for the CTA — defaults to the studio Fiverr profile. */
  href?: string;
}

export const PACKAGES: Package[] = [
  {
    id: 'starter',
    name: 'Starter',
    summary: 'A sharp, professional logo to get a new venture moving.',
    price: 'From $95',
    delivery: '3 days',
    revisions: '2 rounds',
    includes: [
      '2 logo concepts',
      'Final files (SVG, PDF, PNG)',
      'Color & mono versions',
      'Full ownership rights',
    ],
  },
  {
    id: 'identity',
    name: 'Identity',
    summary: 'A complete identity system for brands ready to look established.',
    price: 'From $240',
    delivery: '7 days',
    revisions: '4 rounds',
    highlighted: true,
    includes: [
      '3 logo concepts',
      'Full logo suite & lockups',
      'Color palette & typography',
      'Business card + letterhead',
      'Social media kit',
      'Mini brand guide (PDF)',
      'Full ownership rights',
    ],
  },
  {
    id: 'signature',
    name: 'Signature',
    summary: 'The full studio treatment — identity, guidelines and motion.',
    price: 'From $520',
    delivery: '14 days',
    revisions: 'Unlimited',
    includes: [
      'Everything in Identity',
      'Complete brand guidelines book',
      'Full stationery suite',
      'Animated logo reveal',
      'Social templates (editable)',
      'Priority support',
    ],
  },
];

export const PACKAGES_CTA_FALLBACK = SITE.fiverrUrl;
