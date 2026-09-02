import {
  DEFAULT_ACCENT_COLOR,
  type InvoiceDesignTokens,
  type InvoiceTemplateId,
} from './types';

/** Professionally chosen accents. Every one of these passes the contrast check below. */
export const ACCENT_PRESETS: { id: string; label: string; value: string }[] = [
  { id: 'indigo', label: 'BookFlow', value: DEFAULT_ACCENT_COLOR },
  { id: 'navy', label: 'Navy', value: '#173B6C' },
  { id: 'black', label: 'Black', value: '#111827' },
  { id: 'emerald', label: 'Emerald', value: '#0F7A54' },
  { id: 'royal', label: 'Royal Blue', value: '#1D4ED8' },
  { id: 'burgundy', label: 'Burgundy', value: '#7A1F3D' },
  { id: 'purple', label: 'Purple', value: '#6D28D9' },
];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalises `#abc`, `abc123`, `#ABC123` to `#abc123`. Returns null when it is not a hex colour. */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX.test(trimmed)) return null;

  const body = trimmed.replace('#', '').toLowerCase();
  const full = body.length === 3 ? body.split('').map((char) => char + char).join('') : body;
  return `#${full}`;
}

function channels(hex: string) {
  const body = hex.replace('#', '');
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ] as const;
}

/** WCAG relative luminance. */
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Whether an accent is dark enough to carry white text.
 *
 * A user who picks a pale yellow still gets their colour — the templates simply put dark text on it
 * instead of white, so nothing on the invoice becomes unreadable.
 */
export function prefersLightTextOn(hex: string) {
  return contrastRatio(hex, '#FFFFFF') >= 4.5;
}

/**
 * An accent usable as *text* on a white page needs its own check: a pale accent used for headings
 * would wash out, so it is darkened until it reads.
 */
export function readableAccentText(hex: string) {
  let candidate = hex;
  let guard = 0;

  while (contrastRatio(candidate, '#FFFFFF') < 4.5 && guard < 12) {
    candidate = mix(candidate, '#000000', 0.12);
    guard += 1;
  }

  return candidate;
}

/** Blends two hex colours. `weight` is how much of `other` to take. */
export function mix(hex: string, other: string, weight: number) {
  const base = channels(hex);
  const target = channels(other);
  const parts = base.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * Math.min(1, Math.max(0, weight))),
  );
  return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

export function isValidAccentColor(value: string) {
  return normalizeHexColor(value) !== null;
}

/**
 * The one place invoice colours are decided.
 *
 * Every template reads these tokens instead of naming colours itself, so switching accent recolours
 * all six designs consistently and no template can drift into its own palette.
 */
export function resolveInvoiceTokens(
  accentColor: string,
  templateId: InvoiceTemplateId = 'standard',
): InvoiceDesignTokens {
  const accent = normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_COLOR;
  // Minimal and Elegant sit almost entirely on white, so their accent doubles as heading colour and
  // has to hold up as text rather than only as a filled block.
  const usedAsText = templateId === 'minimal' || templateId === 'elegant';

  return {
    accent: usedAsText ? readableAccentText(accent) : accent,
    accentText: prefersLightTextOn(accent) ? '#FFFFFF' : '#101828',
    accentSoft: mix(accent, '#FFFFFF', 0.92),
    text: '#101828',
    muted: '#667085',
    border: '#E4E7EC',
    background: '#FFFFFF',
    surface: '#F8FAFC',
  };
}
