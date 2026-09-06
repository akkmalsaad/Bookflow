import { useMemo } from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';

/**
 * The one place BookFlow decides what "phone", "tablet" and "large tablet" mean.
 *
 * Nothing here changes the phone build. Every derived style is deliberately `null` at PHONE size,
 * so a screen that spreads `contentStyle` onto its scroll container renders byte-for-byte the
 * layout it rendered before — the approved iPhone design is the baseline, not a starting point.
 *
 * Widths, not device names: an iPad in Split View is 507pt wide and must behave like a phone, and
 * an Android tablet in landscape is 1280pt wide and must behave like a large tablet. Reading the
 * live window width is the only thing that gets both right.
 */

/** Chosen against real device widths: 375–430 phones, 744–834 tablets, 1024–1366 tablet landscape. */
export const BREAKPOINTS = {
  /** iPad mini portrait (744) and 7"+ Android tablets land here; large phones (430) stay below. */
  tablet: 600,
  /** 11"/12.9" iPad portrait (834/1024) and every tablet landscape land here. */
  largeTablet: 900,
} as const;

export type ScreenSize = 'PHONE' | 'TABLET' | 'LARGE_TABLET';

export function getScreenSize(width: number): ScreenSize {
  if (width >= BREAKPOINTS.largeTablet) return 'LARGE_TABLET';
  if (width >= BREAKPOINTS.tablet) return 'TABLET';
  return 'PHONE';
}

type SizeMetrics = {
  /** Screen edge inset. PHONE keeps the 20pt every screen already hard-codes. */
  horizontalPadding: number;
  /** How wide the primary reading column may grow before it stops and centres. */
  contentMaxWidth: number;
  /**
   * Tighter cap for anything read line by line — forms, prose, and text-heavy lists. Roughly the
   * 700–800pt the platform guidelines call comfortable, so a field is never stretched across a
   * 12.9" iPad.
   */
  readingMaxWidth: number;
  /** Gap between major sections of a screen. */
  sectionGap: number;
  /** Gap between sibling cards in a grid or list. */
  cardGap: number;
  /** Calendar day cell height — cells get taller, never wider-and-flatter, as the grid grows. */
  dayCellHeight: number;
  /** Calendar month grid stops here so a day cell never becomes a letterbox. */
  calendarMaxWidth: number;
  /** Bottom sheets stop widening here and centre instead of spanning a 1366pt screen. */
  sheetMaxWidth: number;
  /** A confirmation dialog is narrower than an action sheet — it holds a sentence and two buttons. */
  dialogMaxWidth: number;
  /** Absolute ceiling for a sheet, so a tall landscape window does not produce a 900pt sheet. */
  sheetMaxHeight: number;
  /** The floating tab bar stops here rather than stretching icons across a tablet. */
  tabBarMaxWidth: number;
};

const METRICS: Record<ScreenSize, SizeMetrics> = {
  PHONE: {
    horizontalPadding: 20,
    // Unreachable by construction: no phone-width window is ever capped.
    contentMaxWidth: Number.MAX_SAFE_INTEGER,
    readingMaxWidth: Number.MAX_SAFE_INTEGER,
    sectionGap: 22,
    cardGap: 12,
    dayCellHeight: 48,
    calendarMaxWidth: Number.MAX_SAFE_INTEGER,
    sheetMaxWidth: Number.MAX_SAFE_INTEGER,
    dialogMaxWidth: Number.MAX_SAFE_INTEGER,
    sheetMaxHeight: Number.MAX_SAFE_INTEGER,
    tabBarMaxWidth: Number.MAX_SAFE_INTEGER,
  },
  TABLET: {
    horizontalPadding: 28,
    contentMaxWidth: 780,
    readingMaxWidth: 700,
    sectionGap: 24,
    cardGap: 14,
    dayCellHeight: 62,
    calendarMaxWidth: 620,
    sheetMaxWidth: 560,
    dialogMaxWidth: 520,
    sheetMaxHeight: 720,
    tabBarMaxWidth: 460,
  },
  LARGE_TABLET: {
    horizontalPadding: 32,
    contentMaxWidth: 1000,
    readingMaxWidth: 760,
    sectionGap: 26,
    cardGap: 16,
    dayCellHeight: 68,
    calendarMaxWidth: 680,
    sheetMaxWidth: 600,
    dialogMaxWidth: 560,
    sheetMaxHeight: 760,
    tabBarMaxWidth: 520,
  },
};

/**
 * Column counts are fitted to the available width rather than read off the breakpoint, because a
 * bucket alone produces a cliff: a 600pt window is one point wider than a 599pt one, and switching
 * it straight from two tiles to four made each tile *narrower* than on a 320pt phone. Fitting to a
 * minimum card width instead means the count only ever rises when there is genuinely room for it.
 */
const MIN_STAT_CARD = 160;
const MIN_LIST_CARD = 300;

export type Responsive = SizeMetrics & {
  width: number;
  height: number;
  screenSize: ScreenSize;
  isPhone: boolean;
  isTablet: boolean;
  isLargeTablet: boolean;
  /** True for both tablet sizes — the usual thing a screen actually wants to branch on. */
  isTabletOrLarger: boolean;
  isLandscape: boolean;
  /** Columns for compact metric tiles. Never below two, so phones keep the approved 2-up grid. */
  statColumnCount: number;
  /** Columns for card lists that read better side by side. Capped at two — three reads as a table. */
  listColumnCount: number;
  /**
   * Drop onto a ScrollView/FlatList `contentContainerStyle`, or onto a header/footer row that
   * sits outside the scroll area, to centre it in a controlled column.
   *
   * `null` on phones so the existing style is the only style that applies.
   */
  contentStyle: ViewStyle | null;
  /** Same idea, narrower — for forms, prose, and lists whose rows are mostly text. */
  readingStyle: ViewStyle | null;
  /** Centres and caps a bottom sheet, and lifts it clear of the bottom edge on tablets. */
  sheetStyle: ViewStyle | null;
  /**
   * Promotes a phone bottom sheet to a centred dialog on tablets. An action sheet earns its place
   * at the thumb end of a phone, but a confirmation with two buttons pinned to the bottom edge of a
   * 1366pt-tall iPad is a long way from where the eye and the pointer already are.
   *
   * Apply to the card; apply `dialogBackdropStyle` to the backdrop that holds it.
   */
  dialogStyle: ViewStyle | null;
  /** Re-anchors a `justifyContent: 'flex-end'` backdrop to the centre. Pair with `dialogStyle`. */
  dialogBackdropStyle: ViewStyle | null;
  /** Centres and caps a block inside an already-centred column (e.g. the calendar card). */
  calendarStyle: ViewStyle | null;
  /** Per-cell style for a `listColumnCount`-wide grid; pair with `gridRowStyle`. Null at one column. */
  gridCellStyle: ViewStyle | null;
  /** Row style for the same grid — cancels the cells' outer gutter. Null at one column. */
  gridRowStyle: ViewStyle | null;
};

function buildContentStyle(maxWidth: number, horizontalPadding: number): ViewStyle {
  return {
    width: '100%',
    maxWidth,
    alignSelf: 'center',
    paddingHorizontal: horizontalPadding,
  };
}

/**
 * The single hook every screen uses. It reads the live window through `useWindowDimensions`, so
 * rotation and iPad Split View resize the layout without a remount, and it memoises on
 * width/height so spreading its styles does not churn the tree on every render.
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const screenSize = getScreenSize(width);
    const metrics = METRICS[screenSize];
    const isPhone = screenSize === 'PHONE';
    const halfGutter = metrics.cardGap / 2;

    // Width actually available to cards inside the centred column.
    const columnWidth = Math.min(width, metrics.contentMaxWidth) - metrics.horizontalPadding * 2;
    const fitColumns = (minCardWidth: number, max: number) =>
      Math.max(1, Math.min(max, Math.floor((columnWidth + metrics.cardGap) / (minCardWidth + metrics.cardGap))));
    // Two is the floor: the 2-up snapshot grid is part of the approved phone design even at 320pt.
    const statColumnCount = Math.max(2, fitColumns(MIN_STAT_CARD, 4));
    const listColumnCount = fitColumns(MIN_LIST_CARD, 2);

    return {
      ...metrics,
      width,
      height,
      screenSize,
      isPhone,
      isTablet: screenSize === 'TABLET',
      isLargeTablet: screenSize === 'LARGE_TABLET',
      isTabletOrLarger: !isPhone,
      isLandscape: width > height,
      statColumnCount,
      listColumnCount,
      contentStyle: isPhone ? null : buildContentStyle(metrics.contentMaxWidth, metrics.horizontalPadding),
      readingStyle: isPhone ? null : buildContentStyle(metrics.readingMaxWidth, metrics.horizontalPadding),
      sheetStyle: isPhone
        ? null
        : {
            alignSelf: 'center',
            width: '100%',
            maxWidth: metrics.sheetMaxWidth,
            // Caps the hand-rolled sheets that express their height as a percentage: 92% of a
            // 1024pt-tall landscape window is a sheet nobody can read across.
            maxHeight: metrics.sheetMaxHeight,
            // Freed from the screen edges, so the sheet reads as a card rather than a cut-off panel.
            borderBottomLeftRadius: 30,
            borderBottomRightRadius: 30,
            marginBottom: 16,
          },
      dialogStyle: isPhone
        ? null
        : {
            alignSelf: 'center',
            width: '100%',
            maxWidth: metrics.dialogMaxWidth,
            maxHeight: metrics.sheetMaxHeight,
            // A sheet's top-only corners and upward shadow both belong to the bottom edge it was
            // attached to; a floating card needs neither.
            borderBottomLeftRadius: 30,
            borderBottomRightRadius: 30,
            shadowOffset: { width: 0, height: 12 },
          },
      dialogBackdropStyle: isPhone
        ? null
        : {
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: metrics.horizontalPadding,
          },
      calendarStyle: isPhone
        ? null
        : { alignSelf: 'center', width: '100%', maxWidth: metrics.calendarMaxWidth },
      // Keyed off the column count, not the device size: a 640pt tablet window still fits only one
      // list column, and applying a cell's `flex: 1` there would stretch the card vertically.
      // Margin, not padding, so a card's own internal padding is never overwritten; `maxWidth` is
      // what keeps a lone card on the last row at one column's width instead of the whole row.
      gridCellStyle:
        listColumnCount === 1
          ? null
          : { flex: 1, maxWidth: `${100 / listColumnCount}%`, marginHorizontal: halfGutter },
      gridRowStyle: listColumnCount === 1 ? null : { marginHorizontal: -halfGutter },
    };
  }, [width, height]);
}

/**
 * Height a bottom sheet may grow to. Keeps the existing phone behaviour (a share of the window,
 * minus the status bar) and additionally caps it on tablets, where 92% of a 1024pt-tall window
 * would be a sheet nobody can read across.
 */
export function getSheetMaxHeight(
  windowHeight: number,
  topInset: number,
  heightRatio: number,
  sheetMaxHeight: number,
) {
  return Math.min(windowHeight * heightRatio, windowHeight - topInset - 12, sheetMaxHeight);
}
