import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsDetailScreen, settingsDetailStyles } from '@/components/settings/SettingsDetailScreen';
import { SettingsIcon } from '@/components/settings/SettingsList';
import { getSoftTokens } from '@/components/settings/tokens';
import { useAuth, type AccountSession } from '@/context/auth-context';
import { useSnackbar } from '@/context/snackbar-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useTranslation } from '@/lib/use-translation';
import { captureEvent } from '@/lib/analytics';

/** Signed-in sessions from Clerk. Only fields Clerk reports are shown; nothing is inferred. */
export default function SessionsScreen() {
  const { t, intlLocale } = useTranslation();
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);
  const soft = getSoftTokens(isDarkMode);
  const { showSnackbar } = useSnackbar();
  const { listSessions, revokeSession } = useAuth();

  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setSessions(await listSessions());
    } catch {
      setLoadFailed(true);
    }
  }, [listSessions]);

  useEffect(() => {
    captureEvent('account_sessions_opened');
    void load();
    // listSessions is recreated on every auth render; loading once on open is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revoke = (session: AccountSession) => {
    Alert.alert(t('sessions.revoke.title'), t('sessions.revoke.body'), [
      { text: t('dialog.cancel'), style: 'cancel' },
      {
        text: t('sessions.revoke.confirm'),
        style: 'destructive',
        onPress: async () => {
          setRevokingId(session.id);
          try {
            await revokeSession(session.id);
            setSessions((current) => current?.filter((item) => item.id !== session.id) ?? null);
            showSnackbar({ message: t('sessions.revoked'), tone: 'success' });
          } catch {
            showSnackbar({ message: t('sessions.revokeFailed'), tone: 'danger' });
          } finally {
            setRevokingId(null);
          }
        },
      },
    ]);
  };

  const describeDevice = (session: AccountSession) =>
    [session.browserName, session.deviceType].filter(Boolean).join(' · ') || t('sessions.unknownDevice');

  const describeActivity = (session: AccountSession) => {
    const location = [session.city, session.country].filter(Boolean).join(', ');
    const lastActive = t('sessions.lastActive', {
      time: session.lastActiveAt.toLocaleString(intlLocale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
    });
    return location ? `${location} · ${lastActive}` : lastActive;
  };

  return (
    <SettingsDetailScreen eyebrow={t('security.eyebrow')} title={t('security.sessions.title')} description={t('sessions.description')}>
      {loadFailed ? (
        <View style={[styles.card, { backgroundColor: soft.surface, borderColor: soft.border }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>{t('sessions.loadFailed')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={({ pressed }) => [
              settingsDetailStyles.primaryButton,
              styles.retry,
              { backgroundColor: palette.accent, shadowColor: palette.accent },
              pressed && styles.pressed,
            ]}>
            <Text style={settingsDetailStyles.primaryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {sessions?.map((session) => (
        <View
          key={session.id}
          style={[styles.card, styles.sessionCard, { backgroundColor: soft.surface, borderColor: session.isCurrent ? palette.accent : soft.border }]}>
          <SettingsIcon name={session.isMobile === false ? 'desktop-outline' : 'phone-portrait-outline'} />
          <View style={styles.sessionCopy}>
            <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>
              {describeDevice(session)}
            </Text>
            <Text style={[styles.cardMeta, { color: palette.muter }]} numberOfLines={2}>
              {describeActivity(session)}
            </Text>
            {session.isCurrent ? (
              <View style={[styles.currentBadge, { backgroundColor: soft.accentSoft }]}>
                <Ionicons name="checkmark-circle" size={13} color={palette.accent} />
                <Text style={[styles.currentText, { color: palette.accent }]}>{t('sessions.current')}</Text>
              </View>
            ) : null}
          </View>
          {!session.isCurrent ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('sessions.revoke.confirm')}, ${describeDevice(session)}`}
              disabled={revokingId !== null}
              onPress={() => revoke(session)}
              hitSlop={6}
              style={({ pressed }) => [styles.revoke, { backgroundColor: soft.dangerSoft }, pressed && styles.pressed]}>
              {revokingId === session.id ? (
                <ActivityIndicator color={palette.danger} size="small" />
              ) : (
                <Text style={[styles.revokeText, { color: palette.danger }]}>{t('sessions.revoke.confirm')}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ))}

      {sessions && sessions.length <= 1 ? (
        <Text style={[styles.note, { color: palette.muter }]}>{t('sessions.onlyThisDevice')}</Text>
      ) : null}
    </SettingsDetailScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, marginBottom: 10, padding: 16 },
  sessionCard: { alignItems: 'center', flexDirection: 'row' },
  sessionCopy: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 12.5, fontWeight: '500', lineHeight: 18, marginTop: 3 },
  currentBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  currentText: { fontSize: 11.5, fontWeight: '800' },
  revoke: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', marginLeft: 10, minHeight: 36, minWidth: 76, paddingHorizontal: 12 },
  revokeText: { fontSize: 13, fontWeight: '800' },
  retry: { marginTop: 14 },
  note: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginTop: 6, paddingHorizontal: 4 },
  pressed: { opacity: 0.8 },
});
