import { View } from 'react-native';
import { AppIcon, type AppIconName } from './AppIcon';
import { AppPressable as Pressable } from './AppPressable';
import { AppText as Text } from './AppText';
import { styles } from '../styles';

export type ReviewOverviewMetric = { value: string; label: string; onPress?: () => void };
export type ReviewOverviewProgress = {
  icon: Extract<AppIconName, 'record' | 'interviews' | 'sparkles'>;
  title: string;
  detail: string;
  complete: boolean;
};

export function InterviewReviewOverview({
  headline,
  body,
  metrics,
  progress,
  onOpenEvidence,
}: {
  headline: string;
  body?: string;
  metrics: ReviewOverviewMetric[];
  progress: ReviewOverviewProgress[];
  onOpenEvidence?: () => void;
}) {
  return (
    <View style={styles.hrDemoSectionStack}>
      <View style={styles.hrDemoConclusion}>
        <Text style={styles.hrDemoEyebrow}>本轮结论</Text>
        <Text style={styles.hrDemoConclusionTitle}>{headline}</Text>
        {body ? <Text style={styles.hrDemoBody}>{body}</Text> : null}
      </View>

      <View style={styles.hrDemoMetricGrid}>
        {metrics.slice(0, 3).map((item) => {
          const MetricContainer = item.onPress ? Pressable : View;
          return (
          <MetricContainer
            accessibilityRole={item.onPress ? 'button' : undefined}
            accessibilityLabel={item.onPress ? `查看${item.label}详情` : undefined}
            style={[styles.hrDemoMetric, item.onPress && styles.hrDemoMetricInteractive]}
            key={item.label}
            onPress={item.onPress}
          >
            <Text style={styles.hrDemoMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.value}</Text>
            <Text style={styles.hrDemoMetricLabel} numberOfLines={1}>{item.label}</Text>
          </MetricContainer>
          );
        })}
      </View>

      <View style={styles.hrDemoPlainSection}>
        <Text style={styles.hrDemoSectionTitle}>记录状态</Text>
        {progress.map((item) => (
          <View style={styles.hrDemoProgressRow} key={item.title}>
            <View style={styles.hrDemoProgressIcon}><AppIcon name={item.icon} size={17} color="#2B3935" /></View>
            <Text style={styles.hrDemoProgressTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.hrDemoProgressDetail} numberOfLines={1} ellipsizeMode="tail">{item.detail}</Text>
            <AppIcon name={item.complete ? 'check' : 'circle'} size={17} color={item.complete ? '#047857' : '#9CA3AF'} />
          </View>
        ))}
      </View>

      {onOpenEvidence ? (
        <Pressable style={styles.hrDemoPrimaryAction} onPress={onOpenEvidence}>
          <Text style={styles.hrDemoPrimaryActionText}>查看对话证据</Text>
          <AppIcon name="chevron" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}
