import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { AppIcon, type AppIconName } from './AppIcon';
import { AppPressable as Pressable } from './AppPressable';
import { statusMeta } from '../data/mockData';
import { styles } from '../styles';
import { Theme } from '../theme';
import type { ApplicationStatus, TabId } from '../types';

export function Section({
  title,
  meta,
  actionLabel,
  onAction,
  children,
  variant = 'plain',
}: {
  title?: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  variant?: 'plain' | 'list';
}) {
  return (
    <View style={semanticStyles.section}>
      {title || meta || (actionLabel && onAction) ? (
        <View style={semanticStyles.sectionHeader}>
          <View style={semanticStyles.sectionTitleLine}>
            {title ? <Text style={semanticStyles.sectionTitle}>{title}</Text> : null}
            {meta ? <Text style={semanticStyles.sectionMeta}>{meta}</Text> : null}
          </View>
          {actionLabel && onAction ? (
            <Pressable onPress={onAction} accessibilityRole="button">
              <Text style={semanticStyles.sectionAction}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={variant === 'list' ? semanticStyles.listSurface : undefined}>{children}</View>
    </View>
  );
}

export function ActionRow({
  icon,
  title,
  detail,
  trailing,
  onPress,
  last = false,
}: {
  icon?: AppIconName;
  title: string;
  detail?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const content = (
    <>
      {icon ? (
        <View style={semanticStyles.rowIcon}>
          <AppIcon name={icon} size={18} color={Theme.colors.textSecondary} />
        </View>
      ) : null}
      <View style={semanticStyles.rowBody}>
        <Text style={semanticStyles.rowTitle} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
        {detail ? <Text style={semanticStyles.rowDetail} numberOfLines={2} ellipsizeMode="tail">{detail}</Text> : null}
      </View>
      {trailing ?? (onPress ? <AppIcon name="chevron" size={17} color="#A3A8A5" /> : null)}
    </>
  );

  if (onPress) {
    return (
      <Pressable style={[semanticStyles.actionRow, last && semanticStyles.actionRowLast]} onPress={onPress} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return <View style={[semanticStyles.actionRow, last && semanticStyles.actionRowLast]}>{content}</View>;
}

export function FeatureCard({
  icon,
  eyebrow,
  title,
  detail,
  trailing,
  tone = 'default',
  onPress,
}: {
  icon?: AppIconName;
  eyebrow?: string;
  title: string;
  detail?: string;
  trailing?: ReactNode;
  tone?: 'default' | 'ai' | 'warm';
  onPress?: () => void;
}) {
  const body = (
    <>
      {icon ? (
        <View style={[semanticStyles.featureIcon, tone === 'ai' && semanticStyles.featureIconAi]}>
          <AppIcon name={icon} size={20} color={tone === 'ai' ? Theme.colors.aiAccent : Theme.colors.primaryDeep} />
        </View>
      ) : null}
      <View style={semanticStyles.rowBody}>
        {eyebrow ? <Text style={[semanticStyles.featureEyebrow, tone === 'ai' && semanticStyles.featureEyebrowAi]}>{eyebrow}</Text> : null}
        <Text style={semanticStyles.featureTitle} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
        {detail ? <Text style={semanticStyles.rowDetail} numberOfLines={2} ellipsizeMode="tail">{detail}</Text> : null}
      </View>
      {trailing ?? (onPress ? <AppIcon name="chevron" size={18} color={tone === 'ai' ? Theme.colors.aiAccent : '#929A96'} /> : null)}
    </>
  );

  const cardStyle = [
    semanticStyles.featureCard,
    tone === 'ai' && semanticStyles.featureCardAi,
    tone === 'warm' && semanticStyles.featureCardWarm,
  ];

  if (onPress) {
    return <Pressable style={cardStyle} onPress={onPress} accessibilityRole="button">{body}</Pressable>;
  }
  return <View style={cardStyle}>{body}</View>;
}

export function CompactEmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={semanticStyles.emptyState}>
      <Text style={semanticStyles.emptyTitle}>{title}</Text>
      {detail ? <Text style={semanticStyles.rowDetail}>{detail}</Text> : null}
    </View>
  );
}

export function Metric({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const content = (
    <>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable style={styles.metricCard} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.metricCard}>{content}</View>;
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

export function ListRow({
  title,
  detail,
  showChevron = false,
  onPress,
}: {
  title: string;
  detail?: string;
  showChevron?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.flexOne}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {showChevron || onPress ? <AppIcon name="chevron" size={18} color="#9CA3AF" /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable style={styles.listRow} onPress={onPress} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return <View style={styles.listRow}>{content}</View>;
}

export function StatusPill({
  status,
  onPress,
}: {
  status: ApplicationStatus;
  onPress?: () => void;
}) {
  const meta = statusMeta[status];
  const content = (
    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
      <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return <Pressable onPress={onPress}>{content}</Pressable>;
}

export function ReviewBlock({ title, body, tone = 'neutral' }: { title: string; body: string; tone?: 'neutral' | 'success' | 'risk' | 'action' }) {
  return (
    <View style={[styles.reviewBlock, tone === 'success' && styles.reviewBlockSuccess, tone === 'risk' && styles.reviewBlockRisk, tone === 'action' && styles.reviewBlockAction]}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.paragraph}>{body}</Text>
    </View>
  );
}

export function TabButton({
  id,
  activeTab,
  label,
  icon,
  onPress,
}: {
  id: TabId;
  activeTab: TabId;
  label: string;
  icon: AppIconName;
  onPress: (tab: TabId) => void;
}) {
  const active = activeTab === id;

  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={() => onPress(id)}>
      <AppIcon name={icon} size={21} color={active ? '#2B3935' : '#8A918D'} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const semanticStyles = StyleSheet.create({
  section: { gap: 8 },
  sectionHeader: {
    minHeight: 30,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleLine: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sectionTitle: { color: Theme.colors.textPrimary, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  sectionMeta: { flexShrink: 0, color: Theme.colors.textSecondary, fontSize: 12, lineHeight: 17 },
  sectionAction: { color: Theme.colors.primaryDeep, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  listSurface: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.colors.border,
    borderRadius: 8,
    backgroundColor: Theme.colors.card,
  },
  actionRow: {
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.border,
  },
  actionRowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surfaceSoft,
  },
  rowBody: { minWidth: 0, flex: 1, gap: 3 },
  rowTitle: { color: Theme.colors.textPrimary, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  rowDetail: { color: Theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  featureCard: {
    minHeight: 82,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.colors.border,
    borderRadius: 8,
    backgroundColor: Theme.colors.card,
    ...Theme.shadow.paper,
  },
  featureCardAi: { borderColor: '#E4DDFD', backgroundColor: '#FAF9FF' },
  featureCardWarm: { borderColor: '#E8DED2', backgroundColor: '#FFFCF8' },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.primaryLight,
  },
  featureIconAi: { backgroundColor: '#EEEAFE' },
  featureEyebrow: { color: Theme.colors.primaryDeep, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  featureEyebrowAi: { color: Theme.colors.aiAccent },
  featureTitle: { color: Theme.colors.textPrimary, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  emptyState: { minHeight: 72, justifyContent: 'center', gap: 3, paddingHorizontal: 14, paddingVertical: 12 },
  emptyTitle: { color: Theme.colors.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
