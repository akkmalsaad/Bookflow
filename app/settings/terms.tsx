import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { getTermsOfService } from '@/lib/legal/terms-of-service';
import { useTranslation } from '@/lib/use-translation';

/** The one Terms of Service screen. Settings, Security & privacy and the paywall all open this route. */
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
