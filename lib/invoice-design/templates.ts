import type { InvoiceTemplateId } from './types';

export type InvoiceTemplate = {
  id: InvoiceTemplateId;
  name: string;
  description: string;
  bestFor: string;
  /** Standard is free for everyone; the rest need the Pro entitlement. */
  pro: boolean;
};

export const INVOICE_TEMPLATES: InvoiceTemplate[] = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'The clean BookFlow invoice. Professional out of the box.',
    bestFor: 'Every business',
    pro: false,
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Contemporary layout with a strong accent and a rounded total card.',
    bestFor: 'Photographers, freelancers, consultants, designers',
    pro: true,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Generous white space, thin rules and a large bold total.',
    bestFor: 'Consultants and premium service providers',
    pro: true,
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Full-width accent header carrying your logo and business details.',
    bestFor: 'Agencies, events and media businesses',
    pro: true,
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Refined centred masthead, fine rules and letter-spaced headings.',
    bestFor: 'Weddings, beauty, events and premium services',
    pro: true,
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Denser layout that fits more detail onto a single page.',
    bestFor: 'Contractors, trades and recurring service businesses',
    pro: true,
  },
];

export function getInvoiceTemplate(id: InvoiceTemplateId): InvoiceTemplate {
  return INVOICE_TEMPLATES.find((template) => template.id === id) ?? INVOICE_TEMPLATES[0];
}

/** A template a Free workspace may not use falls back to Standard rather than being refused. */
export function resolveTemplateForEntitlement(id: InvoiceTemplateId, isPro: boolean): InvoiceTemplateId {
  return isPro || !getInvoiceTemplate(id).pro ? id : 'standard';
}
