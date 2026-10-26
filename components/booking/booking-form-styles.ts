import { StyleSheet } from 'react-native';

import type { AppPalette } from '@/context/theme-context';

/**
 * The booking modal's own field styles, shared with the sections added to it (charges, summary,
 * conflict notice, link panel) so they are indistinguishable from the fields already there. The
 * values mirror AddBookingModal's StyleSheet exactly; nothing here introduces a new look.
 */
export type BookingFormColors = {
  palette: AppPalette;
  softSurface: string;
  softInset: string;
  softBorder: string;
  accentSoft: string;
};

export function getBookingFormColors(isDarkMode: boolean, palette: AppPalette): BookingFormColors {
  return {
    palette,
    softSurface: isDarkMode ? '#172033' : '#F7F9FD',
    softInset: isDarkMode ? '#111A2B' : '#EEF2F8',
    softBorder: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)',
    accentSoft: isDarkMode ? '#29284B' : '#E9E8FF',
  };
}

export const bookingFormStyles = StyleSheet.create({
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.65,
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  hint: {
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 6,
  },
  sectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  textLink: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  error: {
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 8,
  },
  pressed: {
    opacity: 0.7,
  },
});
