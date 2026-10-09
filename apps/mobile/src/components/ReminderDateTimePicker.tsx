import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable as NativePressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';
import { AppPressable } from './AppPressable';
import { AppText } from './AppText';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const ITEM_HEIGHT = 46;
const WHEEL_CYCLES = 9;
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const PERIODS = [0, 1];

type WheelColumnProps = {
  values: number[];
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  suffix?: string;
};

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function WheelColumn({ values, value, format, onChange, suffix }: WheelColumnProps) {
  const listRef = useRef<FlatList<number>>(null);
  const repeatedValues = useMemo(
    () => Array.from({ length: WHEEL_CYCLES }, () => values).flat(),
    [values],
  );
  const middleCycle = Math.floor(WHEEL_CYCLES / 2);
  const valueIndex = Math.max(0, values.indexOf(value));
  const centeredIndex = middleCycle * values.length + valueIndex;

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: centeredIndex, animated: false });
    });
  }, [centeredIndex]);

  function settle(offsetY: number) {
    const rawIndex = Math.round(offsetY / ITEM_HEIGHT);
    const normalizedIndex = positiveModulo(rawIndex, values.length);
    const nextValue = values[normalizedIndex];
    if (nextValue !== value) onChange(nextValue);
    if (rawIndex < values.length * 2 || rawIndex >= values.length * (WHEEL_CYCLES - 2)) {
      listRef.current?.scrollToIndex({
        index: middleCycle * values.length + normalizedIndex,
        animated: false,
      });
    }
  }

  return (
    <View style={styles.wheelColumn}>
      <FlatList
        ref={listRef}
        data={repeatedValues}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ item }) => (
          <View style={styles.wheelItem}>
            <View style={styles.wheelValueRow}>
              <AppText numberOfLines={1} style={[styles.wheelText, item === value && styles.wheelTextSelected]}>{format(item)}</AppText>
              {item === value && suffix ? <AppText numberOfLines={1} style={styles.wheelSuffix}>{suffix}</AppText> : null}
            </View>
          </View>
        )}
        initialScrollIndex={centeredIndex}
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(event) => {
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) settle(event.nativeEvent.contentOffset.y);
        }}
        accessibilityRole="adjustable"
      />
    </View>
  );
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatSelectedDate(value: Date) {
  const today = startOfDay(new Date());
  const selected = startOfDay(value);
  const dayOffset = Math.round((selected.getTime() - today.getTime()) / 86_400_000);
  const prefix = dayOffset === 0 ? '今天' : dayOffset === 1 ? '明天' : `${value.getMonth() + 1}月${value.getDate()}日`;
  return `${prefix} · 周${'日一二三四五六'[value.getDay()]}`;
}

function buildCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => (
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
  ));
}

export function ReminderDateTimePicker({
  visible,
  value,
  onClose,
  onConfirm,
  title = '设置提醒',
  timeLabel = '提醒时间',
  confirmLabel = '确定提醒',
  allowPast = false,
}: {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onConfirm: (value: Date) => void;
  title?: string;
  timeLabel?: string;
  confirmLabel?: string;
  allowPast?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [selected, setSelected] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  useEffect(() => {
    if (!visible) return;
    setSelected(new Date(value));
    setVisibleMonth(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value, visible]);

  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const period = selected.getHours() >= 12 ? 1 : 0;
  const twelveHour = selected.getHours() % 12 || 12;
  const isPast = !allowPast && selected.getTime() <= Date.now();

  function updateTime(nextPeriod: number, nextHour: number, nextMinute: number) {
    const next = new Date(selected);
    next.setHours((nextHour % 12) + nextPeriod * 12, nextMinute, 0, 0);
    setSelected(next);
  }

  function selectDate(day: Date) {
    if (!allowPast && startOfDay(day).getTime() < startOfDay(new Date()).getTime()) return;
    const next = new Date(selected);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setSelected(next);
    if (day.getMonth() !== visibleMonth.getMonth()) {
      setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <NativePressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭提醒设置" />
        <View
          style={[styles.sheet, { maxHeight: height * 0.94, paddingBottom: Math.max(14, insets.bottom + 8) }]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <AppText style={styles.title}>{title}</AppText>
              <AppText style={styles.subtitle}>{formatSelectedDate(selected)}</AppText>
            </View>
            <AppPressable style={styles.closeButton} onPress={onClose} accessibilityLabel="关闭提醒设置">
              <AppIcon name="close" size={20} color="#6B7280" />
            </AppPressable>
          </View>

          <View style={styles.calendar}>
            <View style={styles.monthHeader}>
              <AppPressable
                style={styles.monthButton}
                onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
                accessibilityLabel="上个月"
              >
                <AppIcon name="back" size={18} color="#4B5563" />
              </AppPressable>
              <AppText numberOfLines={1} style={styles.monthTitle}>{visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月</AppText>
              <AppPressable
                style={styles.monthButton}
                onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
                accessibilityLabel="下个月"
              >
                <AppIcon name="chevron" size={18} color="#4B5563" />
              </AppPressable>
            </View>
            <View style={styles.weekRow}>
              {WEEKDAYS.map((weekday) => <AppText key={weekday} style={styles.weekday}>{weekday}</AppText>)}
            </View>
            <View style={styles.dayGrid}>
              {calendarDays.map((day) => {
                const active = sameDay(day, selected);
                const today = sameDay(day, new Date());
                const outside = day.getMonth() !== visibleMonth.getMonth();
                const disabled = !allowPast && startOfDay(day).getTime() < startOfDay(new Date()).getTime();
                return (
                  <AppPressable
                    key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                    style={styles.dayCell}
                    disabled={disabled}
                    haptic="selection"
                    onPress={() => selectDate(day)}
                    accessibilityLabel={`${day.getMonth() + 1}月${day.getDate()}日`}
                  >
                    <View style={[styles.dayCircle, active && styles.dayCircleActive]}>
                      <AppText numberOfLines={1} style={[
                        styles.dayText,
                        outside && styles.dayTextOutside,
                        disabled && styles.dayTextDisabled,
                        active && styles.dayTextActive,
                      ]}>{day.getDate()}</AppText>
                    </View>
                    <View style={[styles.todayDot, today && !active && styles.todayDotVisible]} />
                  </AppPressable>
                );
              })}
            </View>
          </View>

          <View style={styles.timeSection}>
            <View style={styles.timeHeading}>
              <AppIcon name="clock" size={17} color="#6B7280" />
              <AppText style={styles.timeLabel}>{timeLabel}</AppText>
              <AppText numberOfLines={1} style={styles.timeValue}>{String(selected.getHours()).padStart(2, '0')}:{String(selected.getMinutes()).padStart(2, '0')}</AppText>
            </View>
            <View style={styles.wheels}>
              <View pointerEvents="none" style={styles.wheelSelection} />
              <WheelColumn values={PERIODS} value={period} format={(item) => item ? '下午' : '上午'} onChange={(nextPeriod) => updateTime(nextPeriod, twelveHour, selected.getMinutes())} />
              <View style={styles.wheelDivider} />
              <WheelColumn values={HOURS} value={twelveHour} format={(item) => String(item).padStart(2, '0')} suffix="时" onChange={(hour) => updateTime(period, hour, selected.getMinutes())} />
              <View style={styles.wheelDivider} />
              <WheelColumn values={MINUTES} value={selected.getMinutes()} format={(item) => String(item).padStart(2, '0')} suffix="分" onChange={(minute) => updateTime(period, twelveHour, minute)} />
            </View>
          </View>

          {isPast ? <AppText style={styles.validation}>提醒时间需要晚于当前时间</AppText> : null}
          <View style={styles.footer}>
            <AppPressable style={styles.secondaryButton} onPress={onClose}>
              <AppText style={styles.secondaryButtonText}>取消</AppText>
            </AppPressable>
            <AppPressable
              style={[styles.confirmButton, isPast && styles.confirmButtonDisabled]}
              disabled={isPast}
              haptic="light"
              onPress={() => onConfirm(selected)}
            >
              <AppText style={styles.confirmButtonText}>{confirmLabel}</AppText>
            </AppPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.28)' },
  sheet: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingTop: 8, paddingHorizontal: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#FFFFFF' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: '#111827', fontSize: 19, lineHeight: 25, fontWeight: '800' },
  subtitle: { marginTop: 1, color: '#6B7280', fontSize: 12, lineHeight: 17 },
  closeButton: { width: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#F3F4F6' },
  calendar: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(17,24,39,0.07)', borderRadius: 12, backgroundColor: '#FFFFFF' },
  monthHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(17,24,39,0.06)' },
  monthButton: { width: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  monthTitle: { minWidth: 150, color: '#111827', fontSize: 15, lineHeight: 22, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  weekRow: { flexDirection: 'row', paddingHorizontal: 5, paddingTop: 8 },
  weekday: { width: '14.2857%', color: '#9CA3AF', fontSize: 11, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 5, paddingTop: 2, paddingBottom: 7 },
  dayCell: { width: '14.2857%', minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 40, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dayCircleActive: { backgroundColor: '#6D5DD3' },
  dayText: { minWidth: 30, color: '#30363D', fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  dayTextOutside: { color: '#C4C9D0' },
  dayTextDisabled: { color: '#E2E5E9' },
  dayTextActive: { color: '#FFFFFF', fontWeight: '900' },
  todayDot: { width: 3, height: 3, marginTop: 1, borderRadius: 2, backgroundColor: 'transparent' },
  todayDotVisible: { backgroundColor: '#7C3AED' },
  timeSection: { marginTop: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(17,24,39,0.07)', borderRadius: 12, backgroundColor: '#FAFAFB' },
  timeHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(17,24,39,0.06)' },
  timeLabel: { flex: 1, color: '#4B5563', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  timeValue: { minWidth: 68, flexShrink: 0, color: '#111827', fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  wheels: { height: ITEM_HEIGHT * 3, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 7 },
  wheelSelection: { position: 'absolute', top: ITEM_HEIGHT, right: 8, left: 8, height: ITEM_HEIGHT, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(109,93,211,0.16)' },
  wheelColumn: { flex: 1, zIndex: 1 },
  wheelContent: { paddingVertical: ITEM_HEIGHT },
  wheelItem: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelValueRow: { minWidth: 72, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 3 },
  wheelText: { minWidth: 42, color: '#C3C7CD', fontSize: 17, lineHeight: 24, fontWeight: '500', textAlign: 'center', fontVariant: ['tabular-nums'] },
  wheelTextSelected: { color: '#111827', fontSize: 21, lineHeight: 28, fontWeight: '800' },
  wheelSuffix: { flexShrink: 0, color: '#6B7280', fontSize: 10, lineHeight: 14, fontWeight: '700' },
  wheelDivider: { width: StyleSheet.hairlineWidth, marginVertical: 14, backgroundColor: 'rgba(17,24,39,0.06)' },
  validation: { marginTop: 8, color: '#B45353', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  secondaryButton: { minHeight: 46, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#FFFFFF' },
  secondaryButtonText: { color: '#4B5563', fontSize: 14, lineHeight: 20, fontWeight: '800' },
  confirmButton: { minHeight: 46, flex: 1.6, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#EEEAFB' },
  confirmButtonDisabled: { opacity: 0.45 },
  confirmButtonText: { color: '#5E4A9B', fontSize: 14, lineHeight: 20, fontWeight: '900' },
});
