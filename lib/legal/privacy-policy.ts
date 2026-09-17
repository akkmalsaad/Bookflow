import { SUPPORT_EMAIL } from '@/lib/legal/contact';
import { PRIVACY_POLICY_MS } from '@/lib/legal/privacy-policy.ms';
import type { LegalDocument } from '@/lib/legal/types';

/**
 * BookFlow's Privacy Policy — the single source for every place the app shows it.
 *
 * Every statement here was checked against the implementation on the date below. When a data flow
 * changes (a new provider, a new field, a change to deletion or analytics), update this text and
 * `lastUpdated` in the same change. tests/privacy-policy.test.cjs guards the most important facts.
 *
 * English and Bahasa Melayu exist, clause for clause, in PRIVACY_POLICIES. Any further language
 * must be a reviewed legal translation, not a machine translation; until one is added there, that
 * locale falls back to English. When this text changes, change privacy-policy.ms.ts with it.
 */

export { SUPPORT_EMAIL };

const PRIVACY_POLICY_EN: LegalDocument = {
  lastUpdated: '2026-09-15',
  language: 'en',
  intro: [
    {
      type: 'paragraph',
      text: 'BookFlow respects your privacy. This Privacy Policy explains how we collect, use, store and handle information when you use the BookFlow application and related services, such as the web page your customers use to view invoices you share.',
    },
    {
      type: 'paragraph',
      text: 'By using BookFlow, you acknowledge the practices described in this Privacy Policy. If you do not agree with them, please do not use BookFlow.',
    },
  ],
  sections: [
    {
      id: 'information-we-collect',
      title: '1. Information We Collect',
      blocks: [
        { type: 'subheading', text: 'Account information' },
        {
          type: 'paragraph',
          text: 'To create and manage your account we process your name, email address and an account identifier. Sign-in is provided by our authentication provider, Clerk. If you sign up with an email address and password, your password is handled by Clerk — BookFlow does not store your password in its own database. If you sign in with Apple or Google, we receive the basic account details that provider shares, such as your name and email address. Clerk also records information about your signed-in sessions, such as the device or browser type, approximate location and IP address, which you can review under Active sessions.',
        },
        { type: 'subheading', text: 'Business information' },
        {
          type: 'paragraph',
          text: 'You can add information used to run your BookFlow workspace, including:',
        },
        {
          type: 'bullets',
          items: [
            'Your business name, SSM registration number, nature of business, phone number, email address, address and website',
            'Your business logo',
            'Bank and DuitNow details you choose to show on invoices',
            'Invoice settings, payment instructions and terms',
            'Services or packages, with their prices and deposit settings',
          ],
        },
        { type: 'subheading', text: 'Customer and booking information' },
        {
          type: 'paragraph',
          text: 'You can add information about your own customers and work, including customer names, email addresses, phone numbers, locations and notes, and booking details such as the service, date, start and end times, location, price, deposit, status and notes. See section 3 for your responsibilities when you add information about other people.',
        },
        { type: 'subheading', text: 'Financial and invoice information' },
        {
          type: 'paragraph',
          text: 'You can record invoices, invoice amounts, due dates, deposits, payments, payment methods and payment status, as well as income and expenses.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow does not process card or bank payments between you and your customers. Payments are recorded manually by you, and BookFlow does not collect or store credit or debit card details.',
        },
        { type: 'subheading', text: 'Invoices you share' },
        {
          type: 'paragraph',
          text: 'When you share an invoice, BookFlow creates a secure link to a copy of that invoice. Anyone who has the link can view the invoice — including your business details and logo, your customer’s name and contact details, and the invoice amounts — and can accept or decline it. Links expire after 30 days.',
        },
        { type: 'subheading', text: 'Support and feedback' },
        {
          type: 'paragraph',
          text: 'When you use Contact Support or Send Feedback, we store the topic or feedback type and the message you write, linked to your account, together with your app version, platform and, for support requests, operating system version.',
        },
        { type: 'subheading', text: 'Technical and usage information' },
        {
          type: 'paragraph',
          text: 'We process technical information such as your app version, platform and operating system, and information about how the app is used — for example, when a booking or invoice is created, when a screen such as Help & Support is opened, and when the app is opened or updated. Usage events describe the action, not the contents of your records.',
        },
        {
          type: 'paragraph',
          text: 'We also use an error-monitoring service to detect crashes and errors. It collects diagnostic details such as device and app information, your IP address and recent app activity when problems occur, and records a sample of app sessions — and sessions where an error occurs — as screen recordings in which text and images are masked.',
        },
        { type: 'subheading', text: 'Information stored on your device' },
        {
          type: 'paragraph',
          text: 'BookFlow keeps some information on your device to work properly, such as your sign-in session, your analytics preference, and booking reminders scheduled with your device’s notification system. BookFlow’s reminders are local notifications; BookFlow does not use push notification tokens.',
        },
      ],
    },
    {
      id: 'how-we-use-information',
      title: '2. How We Use Information',
      blocks: [
        { type: 'paragraph', text: 'We use information to:' },
        {
          type: 'bullets',
          items: [
            'Provide BookFlow’s features and store the business records you create',
            'Create, authenticate and secure your account',
            'Manage your customers, bookings, invoices, payments, income and expenses',
            'Create invoice links, PDFs and reports when you ask for them',
            'Provide BookFlow Pro and check your subscription status',
            'Respond to support requests and review feedback',
            'Understand which features are used, fix problems and improve reliability and the user experience',
            'Detect, prevent and investigate errors, misuse and security issues',
            'Comply with legal obligations where they apply',
          ],
        },
        {
          type: 'paragraph',
          text: 'We do not sell your information, and we do not use the business records you enter to show you advertising.',
        },
      ],
    },
    {
      id: 'customer-information',
      title: '3. Customer Information You Add to BookFlow',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow lets you enter personal information about your customers — such as names, contact details, locations, booking details and notes — so you can manage bookings, invoices and related work.',
        },
        {
          type: 'paragraph',
          text: 'You are responsible for making sure you are allowed to collect and use this information and to enter it into BookFlow, including telling your customers how you use their information where the law requires it. Only add what you need to run your business.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow processes your customers’ information only to provide the features you use, such as storing their records, preparing invoices and creating invoice links you choose to share.',
        },
      ],
    },
    {
      id: 'service-providers',
      title: '4. Service Providers',
      blocks: [
        {
          type: 'paragraph',
          text: 'We use trusted service providers to run BookFlow. Each receives only the information it needs to provide its service and handles it under its own privacy terms:',
        },
        {
          type: 'definitions',
          items: [
            { term: 'Clerk', text: 'Account sign-up, sign-in, password management and session management.' },
            {
              term: 'Supabase',
              text: 'Database, file storage and server functions. Your workspace records, business logo, shared invoice links, support requests and feedback are stored here.',
            },
            { term: 'RevenueCat', text: 'Manages BookFlow Pro subscription status and entitlements, using your account identifier.' },
            { term: 'PostHog', text: 'Product analytics (see section 5).' },
            { term: 'Sentry', text: 'Error and crash monitoring (see section 1).' },
            { term: 'Expo', text: 'Hosts the web page your customers use to view invoices you share.' },
            {
              term: 'Apple',
              text: 'App Store distribution, in-app purchases on iOS, and Sign in with Apple if you choose it.',
            },
            {
              term: 'Google',
              text: 'Google Play distribution, in-app purchases on Android, and Sign in with Google if you choose it.',
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'If you share an invoice through WhatsApp or another app, that app handles the message under its own terms.',
        },
      ],
    },
    {
      id: 'analytics',
      title: '5. Analytics',
      blocks: [
        {
          type: 'paragraph',
          text: 'We use product analytics to understand how BookFlow’s features are used and to improve the application. Analytics events record actions such as signing in, creating a booking or invoice, recording a payment, opening certain screens and opening the app, along with details like your app version and platform.',
        },
        {
          type: 'paragraph',
          text: 'Analytics are linked to your BookFlow account identifier, so they are not anonymous. We do not send the contents of your customer records, invoices, support messages or feedback to analytics.',
        },
        {
          type: 'paragraph',
          text: 'You can turn analytics off at any time with Share app analytics in Settings > Security & privacy. This setting applies to the device you change it on. It does not affect error monitoring, which we use to keep BookFlow working.',
        },
        { type: 'action', label: 'Open Security & privacy', action: 'securityPrivacy' },
      ],
    },
    {
      id: 'subscriptions',
      title: '6. Subscriptions',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow Pro subscriptions are purchased through the Apple App Store or Google Play, depending on your device. Apple or Google processes the payment and handles your billing information under its own privacy practices. BookFlow does not receive or store your full payment card details.',
        },
        {
          type: 'paragraph',
          text: 'We use RevenueCat to confirm your subscription status and unlock Pro features. RevenueCat receives your BookFlow account identifier and purchase information from the store, such as the product, purchase and renewal dates and subscription status.',
        },
      ],
    },
    {
      id: 'storage-security',
      title: '7. Data Storage and Security',
      blocks: [
        {
          type: 'paragraph',
          text: 'We use reasonable technical and organisational measures designed to protect your information. These include:',
        },
        {
          type: 'bullets',
          items: [
            'Encrypted connections (HTTPS) between the app and our service providers',
            'Account sign-in through Clerk',
            'Database access rules that limit each account to its own records',
            'Keeping privileged operations, such as account deletion, on the server rather than in the app',
          ],
        },
        {
          type: 'paragraph',
          text: 'Some information is visible to others by design: anyone with an invoice link you share can view that invoice until the link expires, and your business logo is stored as a publicly accessible image so it can appear on those invoices.',
        },
        {
          type: 'paragraph',
          text: 'No method of electronic storage or transmission is completely secure, and we cannot guarantee absolute security. Please keep your sign-in details private and let us know if you believe your account has been compromised.',
        },
      ],
    },
    {
      id: 'retention',
      title: '8. Data Retention',
      blocks: [
        {
          type: 'paragraph',
          text: 'We keep your information for as long as it is needed to provide BookFlow, maintain your account and meet legitimate operational or legal requirements. Your workspace records stay in your account until you delete them or delete your account.',
        },
        {
          type: 'bullets',
          items: [
            'Invoices you move to Dustbin are permanently removed after 30 days, the next time BookFlow opens after that period.',
            'Shared invoice links stop working after 30 days.',
            'Support requests and feedback are kept until your account is deleted, unless we need to keep them longer for a legal reason.',
          ],
        },
        {
          type: 'paragraph',
          text: 'Some information may remain for a limited time in backups, logs or our service providers’ systems where this is technically necessary, and analytics or error-monitoring data may be kept for the period those services retain it.',
        },
      ],
    },
    {
      id: 'choices-deletion',
      title: '9. Your Choices and Account Deletion',
      blocks: [
        { type: 'subheading', text: 'Privacy controls' },
        {
          type: 'paragraph',
          text: 'In Settings > Security & privacy you can manage how you sign in, change your password (if your account has one), review and sign out other devices, turn analytics off, and delete your account.',
        },
        { type: 'subheading', text: 'Deleting your account' },
        {
          type: 'paragraph',
          text: 'You can delete your account in Settings > Security & privacy > Delete account. BookFlow will ask you to confirm twice before anything is deleted.',
        },
        {
          type: 'paragraph',
          text: 'Deletion removes your BookFlow account and associated BookFlow data according to our deletion process: your customers, bookings, invoices (including Dustbin), payments, income and expenses, services, reminders and notifications, business profile and invoice settings, uploaded business logo, shared invoice links, support requests and feedback, your subscription record with RevenueCat, and your sign-in account with Clerk. Information may be retained where the law requires it or temporarily where technically necessary, as described in section 8.',
        },
        {
          type: 'paragraph',
          text: 'Deleting your BookFlow account does not cancel a subscription billed through the Apple App Store or Google Play. Please cancel BookFlow Pro in your App Store or Google Play subscription settings to stop future charges.',
        },
        { type: 'action', label: 'Open Security & privacy', action: 'securityPrivacy' },
        { type: 'subheading', text: 'Exporting your data' },
        {
          type: 'paragraph',
          text: 'BookFlow Pro subscribers can use Export data & reports to download reports of their bookings, invoices, customer payments, income, expenses and profit and loss for a chosen date range, as PDF, CSV or Excel files. If you cannot use export and would like a copy of your information, contact us.',
        },
        { type: 'action', label: 'Open Export data & reports', action: 'exportData' },
      ],
    },
    {
      id: 'children',
      title: '10. Children’s Privacy',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow is a business and productivity application for people running their own services. It is not designed for or directed at children, and we do not knowingly collect personal information from children for their own use of BookFlow. If you believe a child has created an account, please contact us.',
        },
      ],
    },
    {
      id: 'international',
      title: '11. International Data Processing',
      blocks: [
        {
          type: 'paragraph',
          text: 'Our service providers operate infrastructure in several countries. Your information may therefore be stored or processed outside Malaysia, including in countries whose data protection laws may differ from Malaysia’s. We choose providers that describe safeguards for the data they process.',
        },
      ],
    },
    {
      id: 'rights',
      title: '12. Your Privacy Rights',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow is built for users in Malaysia. Subject to applicable law, such as Malaysia’s Personal Data Protection Act 2010 where it applies, you may have rights to:',
        },
        {
          type: 'bullets',
          items: [
            'Request access to the personal information we hold about you',
            'Ask us to correct information that is inaccurate, incomplete or out of date',
            'Withdraw your consent where we rely on it',
            'Ask us to delete your information where applicable',
            'Exercise other rights provided by applicable law',
          ],
        },
        {
          type: 'paragraph',
          text: 'You can update your business profile and customer records yourself in the app, and delete your account in Settings > Security & privacy. For other requests — including changes to your name or email address — contact us. We may need to verify your identity before acting on a request.',
        },
        {
          type: 'paragraph',
          text: 'If your customers ask about information you entered about them, please handle their request as the business that collected it; we will help where we reasonably can.',
        },
      ],
    },
    {
      id: 'changes',
      title: '13. Changes to This Privacy Policy',
      blocks: [
        {
          type: 'paragraph',
          text: 'We may update this Privacy Policy as BookFlow or legal requirements change. The “Last updated” date at the top shows when it last changed. If we make material changes, we will let you know through the app or by other appropriate means.',
        },
      ],
    },
    {
      id: 'contact',
      title: '14. Contact Us',
      blocks: [
        { type: 'paragraph', text: 'If you have questions about this Privacy Policy or your information, contact us:' },
        { type: 'email', label: 'Email', address: SUPPORT_EMAIL },
        { type: 'action', label: 'Contact Support', action: 'contactSupport' },
      ],
    },
  ],
};

const PRIVACY_POLICIES: Partial<Record<'en' | 'ms-MY', LegalDocument>> = {
  en: PRIVACY_POLICY_EN,
  'ms-MY': PRIVACY_POLICY_MS,
};

/** The policy for the app's language, falling back to English for any locale without one. */
export function getPrivacyPolicy(locale: string): LegalDocument {
  return PRIVACY_POLICIES[locale as 'en' | 'ms-MY'] ?? PRIVACY_POLICY_EN;
}
