import * as Haptics from 'expo-haptics';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export type MonthlyTrendPoint = {
  key: string;
  label: string;
  amount: number;
  isHighlighted?: boolean;
  /** Thinned-out text for the x-axis tick; falls back to `label` when omitted. Pass '' to hide the tick. */
  axisLabel?: string;
};

type Props = {
  data: MonthlyTrendPoint[];
  color: string;
  isDarkMode: boolean;
  formatValue: (amount: number) => string;
  height?: number;
};

const CHART_PADDING_TOP = 46;
const CHART_PADDING_BOTTOM = 28;
const CHART_PADDING_X = 6;

// Smooth cubic curve where each segment's control-point y equals its own endpoint's y,
// so the line never overshoots above/below the actual data points.
function buildSmoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function MonthlyTrendChart({ data, color, isDarkMode, formatValue, height = 190 }: Props) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId();
  const containerRef = useRef<View>(null);
  const containerPageX = useRef(0);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
    containerRef.current?.measure((_x, _y, _measuredWidth, _measuredHeight, pageX) => {
      containerPageX.current = pageX;
    });
  };

  // Snap back to the default highlighted point (e.g. current day/month) whenever the
  // underlying series changes, since a tap-selected index may no longer make sense.
  useEffect(() => {
    setActiveIndex(null);
  }, [data]);

  const chartHeight = height - CHART_PADDING_BOTTOM;

  const points = useMemo(() => {
    if (width === 0 || data.length === 0) return [];

    const amounts = data.map((item) => item.amount);
    const maxAmount = Math.max(...amounts);
    const minAmount = Math.min(...amounts, 0);
    const range = maxAmount - minAmount || 1;
    const usableWidth = width - CHART_PADDING_X * 2;
    const usableHeight = chartHeight - CHART_PADDING_TOP;

    return data.map((item, index) => {
      const x = data.length === 1 ? width / 2 : CHART_PADDING_X + (index / (data.length - 1)) * usableWidth;
      const normalized = (item.amount - minAmount) / range;
      const y = CHART_PADDING_TOP + (1 - normalized) * usableHeight;
      return { ...item, x, y };
    });
  }, [data, width, chartHeight]);

  const linePath = useMemo(() => buildSmoothPath(points), [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const last = points[points.length - 1];
    const first = points[0];
    return `${linePath} L ${last.x} ${chartHeight} L ${first.x} ${chartHeight} Z`;
  }, [linePath, points, chartHeight]);

  const defaultIndex = useMemo(() => {
    const index = data.findIndex((item) => item.isHighlighted);
    return index >= 0 ? index : data.length - 1;
  }, [data]);

  const effectiveIndex = activeIndex ?? defaultIndex;
  const highlighted = points[effectiveIndex] ?? points[points.length - 1];
  const bubbleWidth = 128;
  const bubbleLeft =
    highlighted != null ? Math.min(Math.max(highlighted.x - bubbleWidth / 2, 0), Math.max(width - bubbleWidth, 0)) : 0;

  const handleChartPress = (event: GestureResponderEvent) => {
    if (points.length === 0) return;
    const touchX =
      typeof event.nativeEvent.locationX === 'number'
        ? event.nativeEvent.locationX
        : event.nativeEvent.pageX - containerPageX.current;

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    points.forEach((point, index) => {
      const distance = Math.abs(point.x - touchX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    if (nearestIndex !== effectiveIndex) {
      if (process.env.EXPO_OS === 'ios') {
        Haptics.selectionAsync();
      }
      setActiveIndex(nearestIndex);
    }
  };

  return (
    <View ref={containerRef} style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <Pressable onPress={handleChartPress}>
          <Svg width={width} height={chartHeight}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.32} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
            <Path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {highlighted ? (
              <>
                <Circle cx={highlighted.x} cy={highlighted.y} r={7} fill={isDarkMode ? '#0B1120' : '#FFFFFF'} />
                <Circle cx={highlighted.x} cy={highlighted.y} r={4} fill={color} />
              </>
            ) : null}
          </Svg>
        </Pressable>
      ) : null}

      {highlighted ? (
        <View pointerEvents="none" style={[styles.bubble, { left: bubbleLeft, top: highlighted.y - 54 }]}>
          <Text style={styles.bubbleLabel}>{highlighted.label}</Text>
          <Text style={styles.bubbleValue}>{formatValue(highlighted.amount)}</Text>
        </View>
      ) : null}

      <View style={styles.axisRow}>
        {data.map((item) => (
          <Text
            key={item.key}
            style={[
              styles.axisLabel,
              { color: item.isHighlighted ? color : isDarkMode ? '#7C89AD' : '#93A0BE', fontWeight: item.isHighlighted ? '800' : '600' },
            ]}>
            {item.axisLabel ?? item.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: 128,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#22293F',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bubbleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A8B2CC',
    marginBottom: 2,
  },
  bubbleValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  axisRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    fontSize: 11,
  },
});
