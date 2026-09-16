import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getThemePalette, useTheme } from '@/context/theme-context';
import type { LegalAction, LegalBlock, LegalDocument } from '@/lib/legal/types';

type Props = {
  document: LegalDocument;
  onAction: (action: LegalAction) => void;
  /** Links this surface can open. Others are omitted, e.g. signed-in screens before sign-in. */
  availableActions?: LegalAction[];
};

/**
 * Renders a structured legal document as readable prose: numbered section headings, body text
 * at a comfortable size, and tappable email and in-app links. Text scales with the system font
 * size setting.
 */
export function LegalDocumentView({ document, onAction, availableActions }: Props) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <View>
      <BlockList blocks={document.intro} onAction={onAction} availableActions={availableActions} />
      {document.sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.text }]}>
            {section.title}
          </Text>
          <BlockList blocks={section.blocks} onAction={onAction} availableActions={availableActions} />
        </View>
      ))}
    </View>
  );
}

function BlockList({
  blocks,
  onAction,
  availableActions,
}: {
  blocks: LegalBlock[];
  onAction: (action: LegalAction) => void;
  availableActions?: LegalAction[];
}) {
  const { isDarkMode } = useTheme();
  const palette = getThemePalette(isDarkMode);

  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case 'paragraph':
            return (
              <Text key={key} style={[styles.paragraph, { color: palette.muter }]}>
                {block.text}
              </Text>
            );
          case 'subheading':
            return (
              <Text key={key} accessibilityRole="header" style={[styles.subheading, { color: palette.text }]}>
                {block.text}
              </Text>
            );
          case 'bullets':
            return (
              <View key={key} style={styles.list}>
                {block.items.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: palette.accent }]} />
                    <Text style={[styles.bulletText, { color: palette.muter }]}>{item}</Text>
                  </View>
                ))}
              </View>
            );
          case 'definitions':
            return (
              <View key={key} style={styles.list}>
                {block.items.map((item) => (
                  <Text key={item.term} style={[styles.bulletText, { color: palette.muter }]}>
                    <Text style={[styles.term, { color: palette.text }]}>{item.term}</Text>
                    {' — '}
                    {item.text}
                  </Text>
                ))}
              </View>
            );
          case 'email':
            return (
              <Pressable
                key={key}
                accessibilityRole="link"
                accessibilityLabel={`${block.label}: ${block.address}`}
                onPress={() => void Linking.openURL(`mailto:${block.address}`).catch(() => {})}
                hitSlop={8}
                style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
                <Ionicons name="mail-outline" size={17} color={palette.accent} />
                <Text style={[styles.linkText, { color: palette.accent }]}>{block.address}</Text>
              </Pressable>
            );
          case 'action':
            if (availableActions && !availableActions.includes(block.action)) return null;
            return (
              <Pressable
                key={key}
                accessibilityRole="link"
                onPress={() => onAction(block.action)}
                hitSlop={8}
                style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
                <Text style={[styles.linkText, { color: palette.accent }]}>{block.label}</Text>
                <Ionicons name="arrow-forward" size={16} color={palette.accent} />
              </Pressable>
            );
        }
      })}
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26 },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2, lineHeight: 23, marginBottom: 8 },
  subheading: { fontSize: 15, fontWeight: '700', lineHeight: 21, marginBottom: 4, marginTop: 14 },
  paragraph: { fontSize: 15, fontWeight: '500', lineHeight: 23, marginTop: 6 },
  list: { gap: 8, marginTop: 8 },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  bulletDot: { borderRadius: 3, height: 5, marginTop: 9, width: 5 },
  bulletText: { flex: 1, fontSize: 15, fontWeight: '500', lineHeight: 23 },
  term: { fontWeight: '700' },
  link: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 7, marginTop: 10, minHeight: 44 },
  linkText: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
