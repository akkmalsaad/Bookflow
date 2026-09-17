import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '@/context/app-data-context';
import type { AppNotification } from '@/context/app-data-context';
import { getThemePalette, useTheme } from '@/context/theme-context';
import { useResponsive } from '@/lib/responsive';
import { useTranslation } from '@/lib/use-translation';

const notificationIcons: Record<AppNotification['type'], ComponentProps<typeof Ionicons>['name']> = {
  booking: 'calendar-outline',
  invoice: 'receipt-outline',
  reminder: 'alarm-outline',
};

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { notifications, markNotificationOpened, markAllNotificationsOpened, clearAllNotifications } = useAppData();
  const palette = getThemePalette(isDarkMode);
  const { readingStyle } = useResponsive();
  const { t } = useTranslation();
  const unreadCount = notifications.filter((notification) => !notification.isOpened).length;
  const isEmpty = notifications.length === 0;

  // Emptying the history cannot be undone, so it goes through the same destructive confirmation
  // every other irreversible delete in BookFlow uses.
  const handleClearAll = () => {
    Alert.alert(t('notifications.clearAll.title'), t('notifications.clearAll.body'), [
      { text: t('dialog.cancel'), style: 'cancel' },
      { text: t('notifications.clearAll.confirm'), style: 'destructive', onPress: clearAllNotifications },
    ]);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.header, readingStyle]}>
        <Pressable
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.back')}>
          <Ionicons name="arrow-back" size={22} color={palette.text} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: '#142A3A' }]}>{t('notifications.eyebrow')}</Text>
          <Text style={[styles.title, { color: palette.text }]}>{t('notifications.title')}</Text>
        </View>

        <Pressable
          onPress={markAllNotificationsOpened}
          disabled={unreadCount === 0}
          style={({ pressed }) => [styles.markAllButton, { opacity: unreadCount === 0 ? 0.4 : pressed ? 0.65 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.markAll.label')}
          accessibilityState={{ disabled: unreadCount === 0 }}>
          <Text style={[styles.markAllText, { color: palette.accent }]}>{t('notifications.markAll')}</Text>
        </Pressable>

        <Pressable
          onPress={handleClearAll}
          disabled={isEmpty}
          style={({ pressed }) => [styles.markAllButton, { opacity: isEmpty ? 0.4 : pressed ? 0.65 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.clearAll.label')}
          accessibilityState={{ disabled: isEmpty }}>
          <Text style={[styles.markAllText, { color: palette.danger }]}>{t('notifications.clearAll')}</Text>
        </Pressable>
      </View>

      <View style={[styles.summaryRow, readingStyle]}>
        <Text style={[styles.summary, { color: palette.muter }]}>
          {unreadCount === 0
            ? t('notifications.caughtUp')
            : unreadCount === 1
              ? t('notifications.unread.one')
              : t('notifications.unread', { count: unreadCount })}
        </Text>
      </View>

      <FlatList
        showsVerticalScrollIndicator={false}
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, readingStyle]}
        ListEmptyComponent={
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Ionicons name="notifications-off-outline" size={30} color={palette.muter} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>{t('notifications.emptyTitle')}</Text>
            <Text style={[styles.emptyMessage, { color: palette.muter }]}>{t('notifications.emptyBody')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => markNotificationOpened(item.id)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: item.isOpened ? palette.surface : palette.iconWrap,
                borderColor: item.isOpened ? palette.border : palette.accent,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.message}`}
            accessibilityHint={item.isOpened ? undefined : 'Marks this notification as read'}>
            <View style={[styles.iconWrap, { backgroundColor: palette.surfaceAlt }]}>
              <Ionicons
                name={notificationIcons[item.type]}
                size={21}
                color={item.isOpened ? palette.muter : palette.accent}
              />
            </View>

            <View style={styles.cardCopy}>
              <View style={styles.cardTitleRow}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>{item.title}</Text>
                {!item.isOpened ? <View style={[styles.unreadDot, { backgroundColor: palette.danger }]} /> : null}
              </View>
              <Text style={[styles.message, { color: palette.muter }]}>{item.message}</Text>
              <Text style={[styles.date, { color: palette.muter }]}>{formatNotificationDate(item.createdAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    marginLeft: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  markAllButton: {
    paddingVertical: 10,
    paddingLeft: 10,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '800',
  },
  summaryRow: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  summary: {
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  date: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    padding: 28,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  emptyMessage: {
    fontSize: 13,
    marginTop: 5,
  },
});
