import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

export const COMPACT_SCREEN_MAX = 359;
export const WIDE_SCREEN_MIN = 600;
export const MAX_CONTENT_WIDTH = 720;

export function useResponsiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  return {
    width,
    height,
    fontScale,
    isCompact: width <= COMPACT_SCREEN_MAX,
    isWide: width >= WIDE_SCREEN_MIN,
  };
}

export function ResponsiveRow({
  children,
  compactAt = COMPACT_SCREEN_MAX,
  gap = 10,
  style,
}: {
  children: ReactNode;
  compactAt?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const compact = width <= compactAt;
  return <View style={[styles.row, { gap }, compact && styles.column, style]}>{children}</View>;
}

export function AdaptiveGrid({
  children,
  minItemWidth = 156,
  gap = 8,
  style,
}: {
  children: ReactNode[] | ReactNode;
  minItemWidth?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const availableWidth = Math.min(width, MAX_CONTENT_WIDTH) - 32;
  const columns = availableWidth >= minItemWidth * 2 + gap ? 2 : 1;
  const itemWidth = columns === 2 ? (availableWidth - gap) / 2 : availableWidth;
  const items = Array.isArray(children) ? children : [children];

  return (
    <View style={[styles.grid, { gap }, style]}>
      {items.map((child, index) => (
        <View key={index} style={{ width: itemWidth, minWidth: 0 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flexDirection: 'column' },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap' },
});
