import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { getTermsOfService } from '@/lib/legal/terms-of-service';
import { useTranslation } from '@/lib/use-translation';

/**
 * The one Terms of Service screen, opened from Settings and Security & privacy. The paywall links to
 * Apple's standard EULA instead, which governs the Pro subscription.
 */
export default function TermsScreen() {
  const { t, locale } = useTranslation();

  return (
    <LegalDocumentScreen
      document={getTermsOfService(locale)}
      title={t('sub.terms.title')}
      description={t('sub.terms.description')}
      openedEvent="terms_of_service_opened"
    />
  );
}
