import { useEffect } from 'react';

import { SupportMessageForm } from '@/components/support/SupportMessageForm';
import { getSupportDiagnostics, submitUserFeedback, useSupportInboxClient } from '@/lib/support';
import { FEEDBACK_CATEGORIES, type FeedbackCategory } from '@/lib/support-messages';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';

export default function FeedbackScreen() {
  const { t } = useTranslation();
  const client = useSupportInboxClient();

  useEffect(() => {
    captureEvent('feedback_opened');
  }, []);

  // Only the category and non-identifying build details — the feedback text never goes to analytics.
  const eventProperties = (category: FeedbackCategory) => {
    const { app_version, platform } = getSupportDiagnostics();
    return { category, platform: platform ?? 'unknown', app_version: app_version ?? 'unknown' };
  };

  return (
    <SupportMessageForm<FeedbackCategory>
      eyebrow={t('sub.support')}
      title={t('sub.feedback.title')}
      description={t('sub.feedback.description')}
      optionLabel={t('feedback.type.label')}
      options={FEEDBACK_CATEGORIES}
      getOptionLabel={(category) => t(`feedback.category.${category}`)}
      selectPlaceholder={t('feedback.type.placeholder')}
      optionRequiredMessage={t('feedback.error.optionRequired')}
      placeholder={t('feedback.message.placeholder')}
      submitLabel={t('feedback.submit')}
      unavailableMessage={t('feedback.error.unavailable')}
      successTitle={t('feedback.sent.title')}
      successMessage={t('feedback.sent.body')}
      submit={({ id, option, message }) => submitUserFeedback(client, { id, category: option, message })}
      onSubmitted={(category) => captureEvent('feedback_submitted', eventProperties(category))}
      onFailed={(category, reason) => captureEvent('feedback_failed', { ...eventProperties(category), reason })}
    />
  );
}
