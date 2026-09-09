import { useCallback, useMemo } from 'react';

import { useAppData } from '@/context/app-data-context';
import { getIntlLocale, translate, type Translate, type TranslationKey } from '@/lib/i18n';

/**
 * The active language and a lookup bound to it. Reads the same `language` the workspace persists,
 * so changing it in Settings re-renders every screen using this hook immediately.
 */
export function useTranslation() {
  const { language } = useAppData();

  const t = useCallback<Translate>(
    (key: TranslationKey, values?: Record<string, string | number>) => translate(language, key, values),
    [language],
  );

  return useMemo(() => ({ t, locale: language, intlLocale: getIntlLocale(language) }), [t, language]);
}
