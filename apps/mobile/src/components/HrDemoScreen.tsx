import { Modal, ScrollView, View } from 'react-native';
import { useEffect, useState } from 'react';
import { AppIcon } from './AppIcon';
import { AppPressable as Pressable } from './AppPressable';
import { AppText as Text } from './AppText';
import { styles } from '../styles';
import { InterviewReviewOverview } from './InterviewReviewOverview';

type DemoSection = 'overview' | 'evidence' | 'review';

const evidenceItems = [
  {
    time: '03:42',
    speaker: '面试官',
    title: '如何把不明确的需求变成可交付方案？',
    body: '请结合一个真实项目，说明你如何确认范围、拆分任务并控制风险。',
  },
  {
    time: '04:08',
    speaker: '候选人',
    title: '先确认业务目标，再拆分验证路径',
    body: '我会先把目标、使用场景和验收标准对齐，再把高风险假设做成最小验证。上个项目中，我先验证数据链路，再补交互和自动化，避免后期返工。',
  },
  {
    time: '11:26',
    speaker: '候选人',
    title: '需要补强的回答',
    body: '回答说明了过程，但没有给出周期、准确率或效率变化，结果证据不够完整。',
  },
];

export function HrDemoScreen({ visible, topInset, bottomInset, onClose }: {
  visible: boolean;
  topInset: number;
  bottomInset: number;
  onClose: () => void;
}) {
  const [section, setSection] = useState<DemoSection>('overview');

  useEffect(() => {
    if (visible) setSection('overview');
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.hrDemoScreen, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <View style={styles.hrDemoNav}>
          <Pressable accessibilityLabel="退出演示" style={styles.hrDemoNavButton} onPress={onClose}>
            <AppIcon name="back" size={24} color="#2B3935" />
          </Pressable>
          <Text style={styles.hrDemoNavTitle}>面试复盘</Text>
          <View style={styles.hrDemoNavSide}>
            <Text style={styles.hrDemoPrivacyLabel}>脱敏示例</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.hrDemoContent} showsVerticalScrollIndicator={false}>
          <View style={styles.hrDemoHeader}>
            <View style={styles.hrDemoHeaderTopline}>
              <Text style={styles.hrDemoCompany}>曜石科技</Text>
              <Text style={styles.hrDemoStatus}>进入下一轮</Text>
            </View>
            <Text style={styles.hrDemoRole}>AI 应用工程师 · 二面</Text>
            <Text style={styles.hrDemoMeta}>8月18日 14:00 · 52分钟 · 现场</Text>
          </View>

          <View style={styles.hrDemoSegmented}>
            {([
              ['overview', '概览'],
              ['evidence', '对话证据'],
              ['review', '复盘'],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: section === value }}
                style={[styles.hrDemoSegment, section === value && styles.hrDemoSegmentActive]}
                onPress={() => setSection(value)}
              >
                <Text style={[styles.hrDemoSegmentText, section === value && styles.hrDemoSegmentTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {section === 'overview' ? <DemoOverview onOpenEvidence={() => setSection('evidence')} /> : null}
          {section === 'evidence' ? <DemoEvidence /> : null}
          {section === 'review' ? <DemoReview /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function DemoOverview({ onOpenEvidence }: { onOpenEvidence: () => void }) {
  return (
    <View style={styles.hrDemoSectionStack}>
      <InterviewReviewOverview
        headline="技术思路清楚，项目结果还需要更具体"
        body="能够主动澄清需求并拆解风险；回答中的数据证据偏少，下一轮应优先补足结果指标和个人贡献。"
        metrics={[
          { value: '12', label: '核心问题' },
          { value: '4', label: '行动建议' },
          { value: '4.1', label: '综合表现' },
        ]}
        progress={[
          { icon: 'record', title: '原始录音', detail: '52:34 · 本地保存', complete: true },
          { icon: 'interviews', title: '逐段转写', detail: '完整 · 可定位原音', complete: true },
          { icon: 'sparkles', title: '结构化复盘', detail: '已核对 · 可编辑', complete: true },
        ]}
        onOpenEvidence={onOpenEvidence}
      />

      <View style={styles.hrDemoPrivacyNote}>
        <AppIcon name="check" size={18} color="#047857" />
        <Text style={styles.hrDemoPrivacyText}>录音与求职数据默认保存在设备本地；只有用户主动生成复盘时才发送转写文本。</Text>
      </View>
    </View>
  );
}

function DemoEvidence() {
  return (
    <View style={styles.hrDemoSectionStack}>
      <View style={styles.hrDemoAudioSummary}>
        <View style={styles.hrDemoAudioIcon}>
          <AppIcon name="interviews" size={22} color="#5E4A8A" />
        </View>
        <View style={styles.hrDemoFlex}>
          <Text style={styles.hrDemoAudioTitle}>原始录音 · 52:34</Text>
          <Text style={styles.hrDemoSmall}>正式记录中可点击时间定位原音</Text>
        </View>
        <Text style={styles.hrDemoDemoOnly}>示例未附音频</Text>
      </View>

      <View style={styles.hrDemoEvidenceList}>
        {evidenceItems.map((item, index) => (
          <View style={styles.hrDemoEvidenceItem} key={`${item.time}-${item.speaker}`}>
            <View style={styles.hrDemoEvidenceMeta}>
              <Text style={styles.hrDemoSpeaker}>{item.speaker}</Text>
              <View style={styles.hrDemoTimeLabel}>
                <AppIcon name="play" size={11} color="#6D5A94" />
                <Text style={styles.hrDemoTimeText} maxFontSizeMultiplier={1.1}>{item.time}</Text>
              </View>
            </View>
            <Text style={styles.hrDemoEvidenceTitle}>{item.title}</Text>
            <Text style={styles.hrDemoBody}>{item.body}</Text>
            {index < evidenceItems.length - 1 ? <View style={styles.hrDemoDivider} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function DemoReview() {
  return (
    <View style={styles.hrDemoSectionStack}>
      <View style={styles.hrDemoMetricGrid}>
        <DemoMetric value="4.3" label="结构清晰" />
        <DemoMetric value="3.5" label="证据充分" />
        <DemoMetric value="4.4" label="岗位相关" />
      </View>

      <View style={styles.hrDemoPlainSection}>
        <Text style={styles.hrDemoSectionTitle}>做得好的地方</Text>
        <Text style={styles.hrDemoBody}>先说明目标和约束，再给执行路径，回答主线明确。能够用真实项目解释取舍，而不是只罗列工具。</Text>
        <Text style={styles.hrDemoEvidenceReference}>证据 · 04:08 需求澄清与风险拆解</Text>
      </View>

      <View style={styles.hrDemoPlainSection}>
        <Text style={styles.hrDemoSectionTitle}>需要改进</Text>
        <Text style={styles.hrDemoBody}>项目结果停留在“顺利完成”，缺少周期、效率和质量指标。个人贡献与团队成果的边界也需要说得更清楚。</Text>
        <Text style={styles.hrDemoEvidenceReference}>证据 · 11:26 项目结果追问</Text>
      </View>

      <View style={styles.hrDemoActionSection}>
        <Text style={styles.hrDemoSectionTitle}>下一轮行动</Text>
        <DemoAction index="1" body="为两个核心项目补齐可核验的数据结果" />
        <DemoAction index="2" body="用“背景—行动—结果—复盘”重写项目回答" />
        <DemoAction index="3" body="准备一段 90 秒的岗位匹配说明" />
      </View>
    </View>
  );
}

function DemoMetric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.hrDemoMetric}>
      <Text style={styles.hrDemoMetricValue}>{value}</Text>
      <Text style={styles.hrDemoMetricLabel}>{label}</Text>
    </View>
  );
}

function DemoAction({ index, body }: { index: string; body: string }) {
  return (
    <View style={styles.hrDemoActionRow}>
      <Text style={styles.hrDemoActionIndex}>{index}</Text>
      <Text style={styles.hrDemoActionBody}>{body}</Text>
    </View>
  );
}
