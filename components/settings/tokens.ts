/**
 * The Soft UI surface tokens the BookFlow screens already inline everywhere. Collected here so the
 * settings screens all reach for the same values instead of re-deriving them per file.
 */
export function getSoftTokens(isDarkMode: boolean) {
  return {
    surface: isDarkMode ? '#172033' : '#F7F9FD',
    inset: isDarkMode ? '#111A2B' : '#EEF2F8',
    border: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)',
    shadow: isDarkMode ? '#020617' : '#A7B4C8',
    accentSoft: isDarkMode ? '#29284B' : '#E9E8FF',
    dangerSoft: isDarkMode ? '#3B1F2B' : '#FFF1F2',
    divider: isDarkMode ? 'rgba(255, 255, 255, 0.07)' : 'rgba(17, 24, 39, 0.06)',
  };
}

export type SoftTokens = ReturnType<typeof getSoftTokens>;
