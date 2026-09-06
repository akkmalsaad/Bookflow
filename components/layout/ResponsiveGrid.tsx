import { Children, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useResponsive } from '@/lib/responsive';

type Props = {
  children: ReactNode;
  /**
   * Defaults to the size's `listColumnCount`. Pass `statColumnCount` for compact metric tiles,
   * which pack tighter than full cards.
   */
  columns?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Lays its children out in an even grid, using the negative-gutter idiom the Business snapshot
 * cards were already written around: the row pulls back by half a gutter and each cell pushes in
 * by half, so cards need no measuring and no percentage maths of their own.
 *
 * At one column it renders a plain stack, which is what a phone gets. A row that does not fill —
 * three cards across four columns — leaves the trailing cells empty rather than stretching the
 * last card across them.
 */
export function ResponsiveGrid({ children, columns, style }: Props) {
  const { listColumnCount, cardGap } = useResponsive();
  const columnCount = Math.max(1, columns ?? listColumnCount);
  const items = Children.toArray(children).filter(Boolean);

  if (columnCount === 1) {
    return <View style={style}>{items}</View>;
  }

  const halfGutter = cardGap / 2;

  return (
    <View style={[styles.grid, { marginHorizontal: -halfGutter }, style]}>
      {items.map((item, index) => (
        <View key={index} style={{ width: `${100 / columnCount}%`, paddingHorizontal: halfGutter }}>
          {item}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
