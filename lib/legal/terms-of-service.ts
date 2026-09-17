import { SUPPORT_EMAIL } from '@/lib/legal/contact';
import { TERMS_OF_SERVICE_MS } from '@/lib/legal/terms-of-service.ms';
import type { LegalDocument } from '@/lib/legal/types';

/**
 * BookFlow's Terms of Service — the single source for every place the app shows them.
 *
 * Product statements were checked against the implementation on the date below. Prices and Free
 * plan limits are deliberately not written here: the app and the store show the current ones.
 * When a feature, provider, billing flow or deletion step changes, update this text and
 * `lastUpdated` together. tests/terms-of-service.test.cjs guards the most important facts.
 *
 * English and Bahasa Melayu exist, clause for clause, in TERMS_OF_SERVICE. Any further language
 * must be a reviewed legal translation; until one is added there, that locale falls back to
 * English. When this text changes, change terms-of-service.ms.ts with it.
 */

const TERMS_OF_SERVICE_EN: LegalDocument = {
  lastUpdated: '2026-09-15',
  language: 'en',
  intro: [
    {
      type: 'paragraph',
      text: 'These Terms of Service govern your access to and use of BookFlow and its related services, including the web page your customers use to view invoices you share. By creating an account or using BookFlow, you agree to these Terms.',
    },
    {
      type: 'paragraph',
      text: 'If you do not agree to these Terms, please do not use BookFlow. In these Terms, “BookFlow”, “we” and “us” mean the operator of the BookFlow service, and “you” means the person or business using it.',
    },
  ],
  sections: [
    {
      id: 'eligibility',
      title: '1. Eligibility',
      blocks: [
        {
          type: 'paragraph',
          text: 'You may use BookFlow only if you are legally capable of entering into a binding agreement and you use it for lawful purposes. BookFlow is intended as a business and productivity tool for freelancers and independent professionals. If you use BookFlow on behalf of a business, you confirm that you are authorised to accept these Terms for it.',
        },
      ],
    },
    {
      id: 'account',
      title: '2. Your BookFlow Account',
      blocks: [
        {
          type: 'paragraph',
          text: 'You need an account to use BookFlow. Sign-in is provided through our authentication provider, Clerk, using an email address and password or Sign in with Apple or Google. BookFlow does not store your password in its own database.',
        },
        { type: 'paragraph', text: 'You are responsible for:' },
        {
          type: 'bullets',
          items: [
            'Providing accurate account information and keeping it up to date',
            'Keeping your sign-in details and devices secure',
            'Activity that takes place through your account',
            'Telling us promptly if you believe your account has been compromised',
          ],
        },
        { type: 'paragraph', text: 'You must not:' },
        {
          type: 'bullets',
          items: [
            'Impersonate another person or business',
            'Access, or try to access, another person’s account without permission',
            'Sell, transfer or share access to your account in a way that lets others avoid these Terms or your plan’s limits',
            'Use your account for unlawful activity',
          ],
        },
        {
          type: 'paragraph',
          text: 'You can review the devices signed in to your account, change your password (if your account has one) and sign out other devices in Settings > Security & privacy.',
        },
      ],
    },
    {
      id: 'service',
      title: '3. The BookFlow Service',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow is a business-management and productivity application. Depending on your plan, it provides tools to:',
        },
        {
          type: 'bullets',
          items: [
            'Keep customer records',
            'Record bookings, schedule them and track their status',
            'Receive booking reminders through your device’s notifications',
            'Create invoices, download them as PDFs and share them through a link',
            'Record deposits, payments and payment status',
            'Track income and expenses',
            'View business insights and export reports',
            'Create and restore a backup file of your workspace',
            'Contact support and send feedback',
          ],
        },
        {
          type: 'paragraph',
          text: 'BookFlow is not an accounting firm, accountant, tax adviser, financial adviser, legal adviser, bank, payment processor or escrow provider, and nothing in BookFlow is professional advice.',
        },
      ],
    },
    {
      id: 'business-responsibilities',
      title: '4. Your Business Responsibilities',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow helps you organise information, but you remain responsible for running your business. You are responsible for:',
        },
        {
          type: 'bullets',
          items: [
            'The accuracy of the customer, booking, invoice, payment, income and expense information you enter',
            'Invoice amounts, taxes and any tax registration or reporting obligations',
            'Your payment instructions, including bank and DuitNow details you show on invoices',
            'The services or products you provide',
            'Your agreements and dealings with your customers',
            'Complying with the laws that apply to your business',
          ],
        },
        {
          type: 'paragraph',
          text: 'BookFlow does not verify whether an invoice, tax amount, expense, payment or other record you enter is correct. BookFlow records amounts as you enter them and does not calculate or apply tax.',
        },
      ],
    },
    {
      id: 'customer-information',
      title: '5. Customer Information',
      blocks: [
        {
          type: 'paragraph',
          text: 'You may enter information about your customers into BookFlow, such as names, contact details, locations, booking details and notes. You are responsible for having an appropriate lawful basis, permission or authority to collect and use that information and to enter it into BookFlow, and for handling your customers’ requests about it.',
        },
        {
          type: 'paragraph',
          text: 'Do not enter information you are not legally permitted to process. Our Privacy Policy explains how BookFlow handles information, including information about your customers.',
        },
        { type: 'action', label: 'Privacy Policy', action: 'privacyPolicy' },
      ],
    },
    {
      id: 'bookings',
      title: '6. Bookings',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow provides tools for you to record and manage bookings. Booking details and statuses are based on information you enter, and some statuses may update automatically from records you add, such as a deposit you record. Booking reminders are scheduled on your device and depend on your device’s notification settings, so their delivery is not guaranteed.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow is not a party to any booking or service agreement between you and your customer. BookFlow does not guarantee that a customer will attend or pay, that a service will be performed, that booking information is correct, or the quality of any service you provide. You remain responsible for your relationship with your customers.',
        },
      ],
    },
    {
      id: 'invoices',
      title: '7. Invoices',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow provides tools to create, manage, download and share invoices. Invoices are generated from the information and settings you enter, such as your business details, amounts, due dates, payment instructions and terms. Please review every invoice before you send it.',
        },
        {
          type: 'paragraph',
          text: 'When you share an invoice, BookFlow creates a link to a copy of it. Anyone who has the link can view that invoice until the link expires after 30 days, and can mark it as accepted or declined. An acceptance or decline made through the link is recorded as an invoice status in BookFlow; BookFlow does not verify who responded or create an agreement on your behalf.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow does not guarantee that an invoice meets every legal or tax requirement, is accurate, will be accepted by your customer, or will result in payment. Seek professional accounting, tax or legal advice where appropriate.',
        },
      ],
    },
    {
      id: 'payments',
      title: '8. Payments and Payment Records',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow lets you record payment, deposit and payment-status information for organisational purposes. BookFlow does not process or transfer payments between you and your customers, and it is not connected to any bank or payment gateway.',
        },
        {
          type: 'paragraph',
          text: 'Statuses such as “Deposit Paid” or “Paid”, and any payment you record, are based on information you enter — including statuses BookFlow updates automatically from that information. They do not mean BookFlow has verified that any money was actually received. Always confirm payments with your bank or payment provider.',
        },
      ],
    },
    {
      id: 'financial-records',
      title: '9. Financial Records and Reports',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow may calculate and display income, expenses, profit and loss, reports and business insights. These are based only on the data available in BookFlow and are provided as organisational and informational tools.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow does not provide accounting, tax or financial advice, and does not guarantee that any report is complete, correct or suitable for submission to LHDN (Inland Revenue Board of Malaysia) or any other authority. Reports may help you organise information for tax or accounting purposes, but you remain responsible for verifying your records.',
        },
      ],
    },
    {
      id: 'free-plan',
      title: '10. Free Plan',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow offers a Free plan. Certain features or usage levels are limited on the Free plan, such as the number of customers, bookings or invoices you can create. Current limits are shown within BookFlow.',
        },
        {
          type: 'paragraph',
          text: 'We may reasonably change the features or limits of the Free plan as BookFlow evolves. Where a change is material, we will aim to let you know in advance through the app or by other appropriate means. Records you have already created are not deleted because a limit changes.',
        },
      ],
    },
    {
      id: 'pro',
      title: '11. BookFlow Pro',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow Pro is an optional paid subscription. It may include expanded usage limits and additional features, such as business insights, invoice customisation, a business logo on invoices, data export and workspace backups. The features included are those described in the app at the time, and your access is determined by your active subscription.',
        },
        {
          type: 'paragraph',
          text: 'Current pricing and available subscription options are displayed before you purchase.',
        },
      ],
    },
    {
      id: 'billing',
      title: '12. Subscriptions and Billing',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow Pro is purchased as an in-app subscription through the Apple App Store on iOS or Google Play on Android. Subscriptions are:',
        },
        {
          type: 'bullets',
          items: [
            'Billed by Apple or Google through your App Store or Google Play account',
            'Subject to Apple’s or Google’s applicable payment and subscription terms',
            'Managed through your App Store or Google Play account',
          ],
        },
        {
          type: 'paragraph',
          text: 'Subscriptions renew automatically unless cancelled in line with the applicable store’s rules and the purchase terms shown at the time of purchase. Apple or Google processes the payment; BookFlow does not receive or store your payment card details.',
        },
        {
          type: 'paragraph',
          text: 'We use RevenueCat to manage subscription status and entitlements. Your subscription follows your BookFlow account, so you can restore it on another device by signing in and using Restore Purchases.',
        },
      ],
    },
    {
      id: 'cancelling',
      title: '13. Cancelling BookFlow Pro',
      blocks: [
        {
          type: 'paragraph',
          text: 'You can cancel BookFlow Pro through the store where you bought it:',
        },
        {
          type: 'definitions',
          items: [
            { term: 'Apple App Store', text: 'in your Apple Account subscription settings on your iPhone or iPad.' },
            { term: 'Google Play', text: 'in the Subscriptions section of the Google Play Store.' },
          ],
        },
        {
          type: 'paragraph',
          text: 'You can also reach subscription management from Settings > BookFlow plan. After cancelling, Pro features generally remain available until the end of the current billing period, as determined by the store.',
        },
        {
          type: 'paragraph',
          text: 'Deleting the BookFlow app from your device does not cancel your subscription. Deleting your BookFlow account does not cancel a subscription billed by Apple or Google either. To stop future charges, cancel through the store.',
        },
      ],
    },
    {
      id: 'refunds',
      title: '14. Refunds',
      blocks: [
        {
          type: 'paragraph',
          text: 'Subscriptions are purchased through Apple or Google, so refund eligibility and refund requests are handled according to the applicable store’s policies. Please request a refund from Apple or Google directly. Nothing in these Terms limits any refund rights you may have under applicable law.',
        },
      ],
    },
    {
      id: 'acceptable-use',
      title: '15. Acceptable Use',
      blocks: [
        { type: 'paragraph', text: 'You must not use BookFlow to:' },
        {
          type: 'bullets',
          items: [
            'Break any applicable law',
            'Commit fraud or send misleading invoices',
            'Impersonate any person or business',
            'Distribute malware or harmful code',
            'Gain, or try to gain, unauthorised access to BookFlow, other accounts or related systems',
            'Interfere with or disrupt BookFlow or the services it relies on',
            'Misuse BookFlow’s services, for example through automated requests or by working around plan limits',
            'Upload content you do not have permission to use',
            'Misuse your customers’ information or use it for purposes they would not expect',
            'Facilitate any unlawful activity',
          ],
        },
      ],
    },
    {
      id: 'your-content',
      title: '16. Your Content',
      blocks: [
        {
          type: 'paragraph',
          text: '“Your content” means the information you enter or upload to BookFlow, including business information, customer information, bookings, invoices, logos, notes, payment records, income, expenses and other business data.',
        },
        {
          type: 'paragraph',
          text: 'You keep the rights you have in your content. BookFlow does not claim ownership of your business or customer data. You give BookFlow permission to store, process, display and transmit your content only as necessary to operate and provide BookFlow — for example, to sync your workspace, generate invoices and reports, and show an invoice to someone you share it with.',
        },
        { type: 'subheading', text: 'Logos and uploads' },
        {
          type: 'paragraph',
          text: 'You must have the necessary rights to any logo, image or other content you upload. Do not upload content that infringes someone else’s intellectual property or other rights. Your business logo is stored as a publicly accessible image so it can appear on invoices you share.',
        },
      ],
    },
    {
      id: 'our-ip',
      title: '17. BookFlow Intellectual Property',
      blocks: [
        {
          type: 'paragraph',
          text: 'The BookFlow application, software, interface, name, branding, logos, original designs and documentation are owned by BookFlow or its licensors. Using BookFlow does not transfer ownership of any of them to you. Third-party software and services used in BookFlow remain the property of their respective owners and are used under their licences.',
        },
      ],
    },
    {
      id: 'third-parties',
      title: '18. Third-Party Services',
      blocks: [
        { type: 'paragraph', text: 'BookFlow relies on third-party services to provide parts of the application, including:' },
        {
          type: 'definitions',
          items: [
            { term: 'Clerk', text: 'account sign-in and management' },
            { term: 'Supabase', text: 'database, file storage and server functions' },
            { term: 'RevenueCat', text: 'subscription status and entitlements' },
            { term: 'PostHog', text: 'product analytics' },
            { term: 'Sentry', text: 'error and crash monitoring' },
            { term: 'Expo', text: 'hosting for the invoice page your customers view' },
            { term: 'Apple and Google', text: 'app distribution, in-app purchases and optional sign-in' },
          ],
        },
        {
          type: 'paragraph',
          text: 'These services have their own terms and privacy policies. We cannot control every aspect of their availability or operation. If you share invoices through WhatsApp or another app, that app’s terms apply to your use of it.',
        },
      ],
    },
    {
      id: 'availability',
      title: '19. Availability and Changes',
      blocks: [
        {
          type: 'paragraph',
          text: 'We aim to keep BookFlow reliable, but we do not promise that it will always be available. Maintenance may be needed, outages can happen, and the third-party services BookFlow relies on may experience interruptions. Some features, such as syncing, sharing invoices and subscriptions, need an internet connection.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow will change over time. We may improve, modify or discontinue features where reasonably necessary. If we remove a significant feature included in BookFlow Pro, we will aim to give you reasonable notice, and you can cancel your subscription through the store.',
        },
      ],
    },
    {
      id: 'data-backups',
      title: '20. Data and Backups',
      blocks: [
        {
          type: 'paragraph',
          text: 'Your workspace is saved to your BookFlow account. BookFlow Pro subscribers can export reports and create a workspace backup file they can keep and restore later.',
        },
        { type: 'action', label: 'Export data & reports', action: 'exportData' },
        {
          type: 'paragraph',
          text: 'Invoices you move to Dustbin can be restored for 30 days, after which they are permanently removed. Otherwise, BookFlow cannot guarantee that deleted or lost records can be recovered. We encourage you to keep your own copies of important business records.',
        },
        {
          type: 'paragraph',
          text: 'BookFlow is not an archival or record-keeping service designed to meet legal retention requirements. You are responsible for keeping records for as long as the law requires.',
        },
      ],
    },
    {
      id: 'suspension',
      title: '21. Suspension or Termination',
      blocks: [
        {
          type: 'paragraph',
          text: 'We may restrict or suspend access to BookFlow where reasonably necessary — for example, for a serious breach of these Terms, fraud, a security threat, unlawful use or abuse of the service. Where appropriate and lawful, we will tell you why and give you an opportunity to respond. We will not suspend or terminate accounts arbitrarily.',
        },
        { type: 'paragraph', text: 'You can stop using BookFlow at any time.' },
      ],
    },
    {
      id: 'deletion',
      title: '22. Account Deletion',
      blocks: [
        {
          type: 'paragraph',
          text: 'You can delete your account in Settings > Security & privacy > Delete account. Deleting your account permanently removes your BookFlow account and your BookFlow workspace data, including your customers, bookings, invoices, payment records, income and expenses. It cannot be undone, so export anything you want to keep first.',
        },
        {
          type: 'paragraph',
          text: 'Deleting your BookFlow account does not cancel a subscription billed by Apple or Google. The Privacy Policy explains how personal information is handled when an account is deleted.',
        },
        { type: 'action', label: 'Open Security & privacy', action: 'securityPrivacy' },
        { type: 'action', label: 'Privacy Policy', action: 'privacyPolicy' },
      ],
    },
    {
      id: 'disclaimers',
      title: '23. Disclaimers',
      blocks: [
        {
          type: 'paragraph',
          text: 'BookFlow is provided as a productivity and business-management service. To the extent permitted by applicable law, we do not guarantee:',
        },
        {
          type: 'bullets',
          items: [
            'That BookFlow will be uninterrupted or error-free',
            'The accuracy of information entered by you or anyone else',
            'That invoices will result in payment',
            'Any particular business outcome, revenue or profit',
            'That BookFlow or its reports meet your tax or accounting obligations',
          ],
        },
        {
          type: 'paragraph',
          text: 'Nothing in these Terms excludes or limits any rights or guarantees you have under applicable law that cannot be excluded or limited, including under Malaysian consumer protection law where it applies.',
        },
      ],
    },
    {
      id: 'liability',
      title: '24. Limitation of Liability',
      blocks: [
        {
          type: 'paragraph',
          text: 'To the extent permitted by applicable law, BookFlow is not responsible for indirect or consequential losses, or for losses arising from matters outside our reasonable control or from your own business and customer relationships, such as:',
        },
        {
          type: 'bullets',
          items: [
            'Lost business opportunities',
            'Disputes between you and your customers',
            'Incorrect information entered by you',
            'A customer’s failure to pay',
            'Outages of third-party services',
          ],
        },
        {
          type: 'paragraph',
          text: 'Nothing in these Terms limits our liability where it cannot be limited under applicable law, including for our own fraud or for losses caused by our negligence where the law does not allow that liability to be excluded.',
        },
      ],
    },
    {
      id: 'governing-law',
      title: '25. Governing Law',
      blocks: [
        {
          type: 'paragraph',
          text: 'These Terms are governed by the laws of Malaysia, without affecting any mandatory rights you may have under the laws that apply to you. If you have a concern, please contact us first so we can try to resolve it.',
        },
      ],
    },
    {
      id: 'changes',
      title: '26. Changes to These Terms',
      blocks: [
        {
          type: 'paragraph',
          text: 'We may update these Terms as BookFlow, our business or applicable requirements change. The “Last updated” date at the top shows when they last changed. If we make material changes, we will let you know through the app or by other appropriate means before they take effect, where required. If you do not agree to updated Terms, you can stop using BookFlow and delete your account.',
        },
      ],
    },
    {
      id: 'privacy',
      title: '27. Privacy',
      blocks: [
        {
          type: 'paragraph',
          text: 'Our Privacy Policy explains how we collect, use and protect information when you use BookFlow.',
        },
        { type: 'action', label: 'Privacy Policy', action: 'privacyPolicy' },
      ],
    },
    {
      id: 'contact',
      title: '28. Contact Us',
      blocks: [
        {
          type: 'paragraph',
          text: 'If you have questions about these Terms, contact us by email or through Help & Support in the BookFlow app.',
        },
        { type: 'email', label: 'Email', address: SUPPORT_EMAIL },
        { type: 'action', label: 'Contact Support', action: 'contactSupport' },
      ],
    },
  ],
};

const TERMS_OF_SERVICE: Partial<Record<'en' | 'ms-MY', LegalDocument>> = {
  en: TERMS_OF_SERVICE_EN,
  'ms-MY': TERMS_OF_SERVICE_MS,
};

/** The Terms for the app's language, falling back to English for any locale without one. */
export function getTermsOfService(locale: string): LegalDocument {
  return TERMS_OF_SERVICE[locale as 'en' | 'ms-MY'] ?? TERMS_OF_SERVICE_EN;
}
