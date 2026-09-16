/**
 * A legal document as plain structured content, independent of React Native, so the same copy can
 * be rendered in the app and later synchronised with bookflow.my.
 *
 * Actions are named by intent (e.g. 'contactSupport'), never by app route — each surface decides
 * where an action goes.
 */

export type LegalAction = 'contactSupport' | 'securityPrivacy' | 'exportData' | 'privacyPolicy' | 'termsOfService';

export type LegalBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'bullets'; items: string[] }
  /** A named item with its explanation, e.g. a service provider and what it does. */
  | { type: 'definitions'; items: { term: string; text: string }[] }
  | { type: 'email'; label: string; address: string }
  | { type: 'action'; label: string; action: LegalAction };

export type LegalSection = {
  id: string;
  title: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  /** ISO date (YYYY-MM-DD) the text last changed. Update it with every edit to the copy. */
  lastUpdated: string;
  /** The language this text is actually written in; may differ from the requested locale. */
  language: 'en' | 'ms-MY';
  intro: LegalBlock[];
  sections: LegalSection[];
};
