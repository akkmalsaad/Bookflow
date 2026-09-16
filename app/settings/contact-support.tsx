import { useEffect } from 'react';

import { SupportMessageForm } from '@/components/support/SupportMessageForm';
import { getSupportDiagnostics, submitSupportRequest, useSupportInboxClient } from '@/lib/support';
import { SUPPORT_TOPICS, type SupportTopic } from '@/lib/support-messages';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';

export default function ContactSupportScreen() {
  const { t } = useTranslation();
  const client = useSupportInboxClient();

  useEffect(() => {
    captureEvent('support_contact_opened');
  }, []);

  // Only the topic and non-identifying build details — the message itself never goes to analytics.
  const eventProperties = (topic: SupportTopic) => {
    const { app_version, platform } = getSupportDiagnostics();
    return { topic, platform: platform ?? 'unknown', app_version: app_version ?? 'unknown' };
  };

  return (
    <SupportMessageForm<SupportTopic>
      eyebrow={t('sub.support')}
      title={t('support.title')}
      description={t('support.description')}
      optionLabel={t('support.topic.label')}
      options={SUPPORT_TOPICS}
      getOptionLabel={(topic) => t(`support.topic.${topic}`)}
      selectPlaceholder={t('support.topic.placeholder')}
      optionRequiredMessage={t('support.error.optionRequired')}
      placeholder={t('support.message.placeholder')}
      submitLabel={t('support.submit')}
      unavailableMessage={t('support.error.unavailable')}
      successTitle={t('support.sent.title')}
      successMessage={t('support.sent.body')}
      submit={({ id, option, message }) => submitSupportRequest(client, { id, topic: option, message })}
      onSubmitted={(topic) => captureEvent('support_request_submitted', eventProperties(topic))}
      onFailed={(topic, reason) => captureEvent('support_request_failed', { ...eventProperties(topic), reason })}
    />
  );
}
