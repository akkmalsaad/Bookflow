import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { getPrivacyPolicy } from '@/lib/legal/privacy-policy';
import { useTranslation } from '@/lib/use-translation';

/** The one Privacy Policy screen. Settings, Security & privacy, Help & Support and the paywall all open this route. */
export default function PrivacyPolicyScreen() {
  const { t, locale } = useTranslation();

  return (
    <LegalDocumentScreen
      document={getPrivacyPolicy(locale)}
      title={t('sub.privacy.title')}
      description={t('sub.privacy.description')}
      openedEvent="privacy_policy_opened"
    />
  );
}
