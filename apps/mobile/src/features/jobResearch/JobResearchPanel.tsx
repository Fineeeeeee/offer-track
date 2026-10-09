import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';
import { AppIcon } from '../../components/AppIcon';
import { AppPressable as Pressable } from '../../components/AppPressable';
import { AppText as Text, AppTextInput as TextInput } from '../../components/AppText';
import { FadeInView } from '../../components/Motion';
import { Theme } from '../../theme';
import type { AiServiceSettings, Job, JobNote, JobResearchItem } from '../../types';
import {
  buildSocialResearchQuery,
  buildSocialResearchUrl,
  createResearchItem,
  socialResearchPlatforms,
  sourceLabel,
} from '../../services/socialResearch';
import {
  formatResearchNote,
  jobResearchPresets,
  searchJobResearch,
  summarizeJobResearch,
  type JobResearchPreset,
  type JobResearchSource,
  type JobResearchSummary,
} from '../../services/jobResearch';
import {
  buildXiaohongshuResearchQuery,
  formatStoredMcpResearchContent,
  researchJobWithXiaohongshuMcp,
  resolveStoredMcpResearchTitle,
  type XiaohongshuResearchProgress,
} from '../../services/xiaohongshuMcp';

export function JobResearchPanel({
  job,
  note,
  searchApiKey,
  aiSettings,
  aiApiKey,
  savedItems,
  onOpenSettings,
  onSaveNote,
  onSaveResearchItem,
}: {
  job: Job;
  note: JobNote;
  searchApiKey: string;
  aiSettings: AiServiceSettings;
  aiApiKey: string;
  savedItems: JobResearchItem[];
  onOpenSettings: () => void;
  onSaveNote: (value: string) => void;
  onSaveResearchItem: (item: JobResearchItem) => void;
}) {
  const [preset, setPreset] = useState<JobResearchPreset>('risk');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState<'searching' | 'summarizing' | null>(null);
  const [sources, setSources] = useState<JobResearchSource[]>([]);
  const [summary, setSummary] = useState<JobResearchSummary | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showPlatforms, setShowPlatforms] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [mcpProgress, setMcpProgress] = useState<XiaohongshuResearchProgress | null>(null);
  const aiConfigured = Boolean(aiSettings.reviewUrl.trim() && aiSettings.reviewModel.trim() && aiApiKey.trim());
  const mcpConfigured = Boolean(aiSettings.researchMcpUrl?.trim());
  const mcpQuery = buildXiaohongshuResearchQuery(job, preset, question);

  useEffect(() => {
    setQuestion('');
    setSources([]);
    setSummary(null);
    setError('');
    setSaved(false);
    setShowPlatforms(false);
    setSourceUrl('');
    setSourceTitle('');
    setSourceNote('');
    setMcpProgress(null);
  }, [job.id]);

  async function runResearch() {
    const savedSources = savedItems.map((item) => ({
      title: item.source === 'xiaohongshu' ? resolveStoredMcpResearchTitle(item.title, item.note) : item.title,
      url: item.url,
      content: item.source === 'xiaohongshu' ? formatStoredMcpResearchContent(item.note) : item.note,
      site: sourceLabel(item.source),
      publishedAt: item.createdAt.slice(0, 10),
    }));
    if (!searchApiKey.trim() && !mcpConfigured) {
      setShowPlatforms(true);
      setSources(savedSources);
      setSummary(null);
      setSaved(false);
      if (!savedSources.length || !aiConfigured) {
        setError(savedSources.length
          ? '已显示保存资料；配置复盘模型后可自动整理。'
          : '未配置智能搜索，可以先去常用平台查看并保存资料。');
        return;
      }
      setBusy('summarizing');
      setError('');
      try {
        setSummary(await summarizeJobResearch({
          job,
          note,
          preset,
          question,
          sources: savedSources,
          settings: aiSettings,
          apiKey: aiApiKey,
        }));
      } catch (summaryError) {
        setError(`已保存资料，AI 整理失败：${summaryError instanceof Error ? summaryError.message : '未知错误'}`);
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy('searching');
    setSources([]);
    setSummary(null);
    setError('');
    setSaved(false);
    setMcpProgress(null);
    try {
      const remoteSources = mcpConfigured
        ? await researchJobWithXiaohongshuMcp({
            endpoint: aiSettings.researchMcpUrl ?? '',
            job,
            focus: question,
            preset,
            onProgress: setMcpProgress,
          })
        : (await searchJobResearch({ job, preset, question, apiKey: searchApiKey })).sources;
      const combinedSources = [...savedSources, ...remoteSources].filter(
        (source, index, values) => values.findIndex((item) => item.url === source.url) === index,
      );
      setSources(combinedSources);
      if (!aiConfigured) {
        setError('来源已返回；配置复盘模型后可自动整理。');
        return;
      }
      setBusy('summarizing');
      try {
        setSummary(await summarizeJobResearch({
          job,
          note,
          preset,
          question,
          sources: combinedSources,
          settings: aiSettings,
          apiKey: aiApiKey,
        }));
      } catch (summaryError) {
        setError(`来源已保留，AI 整理失败：${summaryError instanceof Error ? summaryError.message : '未知错误'}`);
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : '搜索没有成功完成。');
    } finally {
      setBusy(null);
      setMcpProgress(null);
    }
  }

  function saveSummary() {
    if (!summary) return;
    onSaveNote(formatResearchNote(summary, preset));
    setSaved(true);
  }

  function openPlatform(platform: Exclude<JobResearchItem['source'], 'web'>) {
    const query = buildSocialResearchQuery(job, question);
    void Linking.openURL(buildSocialResearchUrl(platform, query));
  }

  function saveResearchSource() {
    try {
      const item = createResearchItem({ url: sourceUrl, title: sourceTitle, note: sourceNote });
      onSaveResearchItem(item);
      setSourceUrl('');
      setSourceTitle('');
      setSourceNote('');
    } catch (saveError) {
      Alert.alert('无法保存资料', saveError instanceof Error ? saveError.message : '请检查链接后重试。');
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingIcon}><AppIcon name="globe" size={20} color={Theme.colors.aiAccent} /></View>
        <View style={styles.flexOne}>
          <Text style={styles.title}>在线调研</Text>
          <Text style={styles.meta}>{job.company} · {job.title}</Text>
        </View>
      </View>

      <View style={styles.presetRow}>
        {jobResearchPresets.map((item) => (
          <Pressable
            key={item.value}
            style={[styles.preset, preset === item.value && styles.presetActive]}
            onPress={() => setPreset(item.value)}
          >
            <Text style={[styles.presetText, preset === item.value && styles.presetTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.questionInput}
        value={question}
        onChangeText={setQuestion}
        placeholder="还想重点查什么？例如是否长期驻场"
        placeholderTextColor="#9CA3AF"
        returnKeyType="search"
        onSubmitEditing={() => void runResearch()}
      />
      {mcpConfigured ? (
        <Pressable
          style={[styles.queryPreview, busy && styles.disabled]}
          disabled={Boolean(busy)}
          onPress={() => void runResearch()}
          accessibilityRole="button"
          accessibilityLabel={`使用关键词搜索：${mcpQuery}`}
        >
          <AppIcon name="search" size={14} color="#6B7280" />
          <Text style={styles.queryPreviewText} numberOfLines={2}>{mcpQuery}</Text>
        </Pressable>
      ) : null}

      <Pressable style={[styles.searchButton, busy && styles.disabled]} disabled={Boolean(busy)} onPress={() => void runResearch()}>
        {busy ? <ActivityIndicator size="small" color="#5B21B6" /> : <AppIcon name="search" size={18} color="#5B21B6" />}
        <Text style={styles.searchButtonText}>{busy === 'searching' ? mcpProgress?.detail ?? '正在搜索来源' : busy === 'summarizing' ? '正在整理结果' : '开始调研'}</Text>
      </Pressable>

      {mcpProgress ? <Text style={styles.meta}>{mcpProgress.detail}</Text> : null}

      {error ? <Text style={styles.message}>{error}</Text> : null}

      {showPlatforms ? (
        <FadeInView style={styles.platformPanel}>
          <View style={styles.sourcesHeader}>
            <Text style={styles.summaryTitle}>去平台查看</Text>
            {!searchApiKey.trim() && !mcpConfigured ? (
              <Pressable onPress={onOpenSettings}><Text style={styles.settingsLink}>配置智能汇总</Text></Pressable>
            ) : null}
          </View>
          <View style={styles.platformRow}>
            {socialResearchPlatforms.map((platform) => (
              <Pressable key={platform.value} style={styles.platformButton} onPress={() => openPlatform(platform.value)}>
                <Text style={styles.platformButtonText}>{platform.label}</Text>
                <AppIcon name="chevron" size={14} color="#6B7280" />
              </Pressable>
            ))}
          </View>
          <Text style={styles.meta}>应用会带上当前公司、岗位和关注点；看到有价值的帖子后，将链接粘贴到下面。</Text>
          <TextInput
            style={styles.questionInput}
            value={sourceUrl}
            onChangeText={setSourceUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="粘贴帖子或网页链接"
            placeholderTextColor="#9CA3AF"
          />
          <Pressable
            style={styles.clipboardButton}
            onPress={() => {
              void Clipboard.getStringAsync().then((value) => {
                if (value.trim()) setSourceUrl(value.trim());
              });
            }}
          >
            <AppIcon name="copy" size={15} color="#6B7280" />
            <Text style={styles.clipboardButtonText}>从剪贴板读取链接</Text>
          </Pressable>
          <TextInput
            style={styles.questionInput}
            value={sourceTitle}
            onChangeText={setSourceTitle}
            placeholder="标题（可选）"
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={[styles.questionInput, styles.noteInput]}
            value={sourceNote}
            onChangeText={setSourceNote}
            multiline
            placeholder="记下可信线索或需要核实的问题"
            placeholderTextColor="#9CA3AF"
          />
          <Pressable style={styles.saveButton} onPress={saveResearchSource}>
            <AppIcon name="marker" size={17} color={Theme.colors.primaryDeep} />
            <Text style={styles.saveButtonText}>保存到当前职位</Text>
          </Pressable>
        </FadeInView>
      ) : (
        <Pressable style={styles.continueResearch} onPress={() => setShowPlatforms(true)}>
          <Text style={styles.continueResearchText}>去社交平台继续查</Text>
          <AppIcon name="chevron" size={15} color="#6B7280" />
        </Pressable>
      )}

      {savedItems.length ? (
        <FadeInView style={styles.sources}>
          <View style={styles.sourcesHeader}>
            <Text style={styles.summaryTitle}>已存资料</Text>
            <Text style={styles.meta}>{savedItems.length} 条</Text>
          </View>
          {savedItems.map((item) => (
            <Pressable key={item.id} style={styles.sourceRow} onPress={() => void Linking.openURL(item.url)}>
              <View style={styles.flexOne}>
                <Text style={styles.sourceTag}>{sourceLabel(item.source)}</Text>
                <Text style={styles.sourceTitle} numberOfLines={2}>{item.source === 'xiaohongshu' ? resolveStoredMcpResearchTitle(item.title, item.note) : item.title}</Text>
                {item.note ? <Text style={styles.sourceContent} numberOfLines={3}>{item.source === 'xiaohongshu' ? formatStoredMcpResearchContent(item.note) : item.note}</Text> : null}
              </View>
              <AppIcon name="chevron" size={18} color="#9CA3AF" />
            </Pressable>
          ))}
        </FadeInView>
      ) : null}

      {summary ? (
        <FadeInView style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>本次观察</Text>
          <Text style={styles.body}>{summary.overview}</Text>
          <SummaryList title="风险线索" values={summary.riskSignals} tone="risk" />
          <SummaryList title="正面线索" values={summary.positiveSignals} tone="positive" />
          <SummaryList title="面试线索" values={summary.interviewClues} tone="neutral" />
          <SummaryList title="下一步" values={summary.actions} tone="action" />
          {summary.caveat ? <Text style={styles.caveat}>{summary.caveat}</Text> : null}
          <Pressable style={styles.saveButton} onPress={saveSummary} disabled={saved}>
            <AppIcon name={saved ? 'check' : 'marker'} size={17} color={Theme.colors.primaryDeep} />
            <Text style={styles.saveButtonText}>{saved ? '已保存到职位备注' : '保存到职位备注'}</Text>
          </Pressable>
        </FadeInView>
      ) : null}

      {sources.length ? (
        <FadeInView style={styles.sources}>
          <View style={styles.sourcesHeader}>
            <Text style={styles.summaryTitle}>来源</Text>
            <Text style={styles.meta}>{sources.length} 条</Text>
          </View>
          {sources.map((source) => (
            <Pressable key={source.url} style={styles.sourceRow} onPress={() => void Linking.openURL(source.url)}>
              <View style={styles.flexOne}>
                <View style={styles.sourceMetaRow}>
                  <Text style={styles.sourceTag}>{source.site}</Text>
                  {source.publishedAt ? <Text style={styles.meta}>{source.publishedAt}</Text> : null}
                </View>
                <Text style={styles.sourceTitle} numberOfLines={2}>{source.title}</Text>
                {source.content ? <Text style={styles.sourceContent} numberOfLines={3}>{source.content}</Text> : null}
              </View>
              <AppIcon name="chevron" size={18} color="#9CA3AF" />
            </Pressable>
          ))}
        </FadeInView>
      ) : null}
    </View>
  );
}

function SummaryList({ title, values, tone }: { title: string; values: string[]; tone: 'risk' | 'positive' | 'neutral' | 'action' }) {
  if (!values.length) return null;
  return (
    <View style={[styles.summaryBlock, styles[`${tone}Block`]]}>
      <Text style={styles.blockTitle}>{title}</Text>
      {values.map((value) => <Text style={styles.body} key={value}>• {value}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingIcon: { width: 36, minHeight: 36, borderRadius: 8, backgroundColor: '#F2EEFF', alignItems: 'center', justifyContent: 'center' },
  flexOne: { flex: 1, minWidth: 0 },
  title: { color: Theme.colors.textPrimary, fontSize: 17, fontWeight: '700' },
  meta: { color: Theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  queryPreview: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, backgroundColor: '#F7F8FA' },
  queryPreviewText: { flexShrink: 1, color: Theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: Theme.colors.card, justifyContent: 'center' },
  presetActive: { backgroundColor: '#F2EEFF', borderColor: 'rgba(124, 58, 237, 0.22)' },
  presetText: { color: Theme.colors.textSecondary, fontSize: 13 },
  presetTextActive: { color: '#5B21B6', fontWeight: '600' },
  questionInput: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#FFFFFF', color: Theme.colors.textPrimary, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  searchButton: { minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.20)', backgroundColor: '#F2EEFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 11 },
  searchButtonText: { color: '#5B21B6', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  message: { color: Theme.colors.textSecondary, fontSize: 13, lineHeight: 20 },
  platformPanel: { gap: 10, paddingTop: 2 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  platformButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#FFFFFF' },
  platformButtonText: { color: Theme.colors.textPrimary, fontSize: 13, fontWeight: '600' },
  settingsLink: { color: '#5B21B6', fontSize: 12, fontWeight: '600' },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  clipboardButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  clipboardButtonText: { color: Theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  continueResearch: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  continueResearchText: { color: Theme.colors.textSecondary, fontSize: 13 },
  summaryCard: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#FAF8FF', borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.10)' },
  summaryTitle: { color: Theme.colors.textPrimary, fontSize: 15, fontWeight: '700' },
  body: { color: Theme.colors.textPrimary, fontSize: 14, lineHeight: 22 },
  summaryBlock: { gap: 4, padding: 10, borderRadius: 8 },
  riskBlock: { backgroundColor: '#FFF5F4' },
  positiveBlock: { backgroundColor: '#F1FAF5' },
  neutralBlock: { backgroundColor: '#F3F6FA' },
  actionBlock: { backgroundColor: '#F4F2FF' },
  blockTitle: { color: Theme.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  caveat: { color: Theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  saveButton: { minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9 },
  saveButtonText: { color: Theme.colors.primaryDeep, fontSize: 13, fontWeight: '600' },
  sources: { gap: 0, borderTopWidth: 1, borderTopColor: Theme.colors.border, paddingTop: 12 },
  sourcesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  sourceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  sourceTag: { color: '#5B21B6', fontSize: 11, fontWeight: '600' },
  sourceTitle: { color: Theme.colors.textPrimary, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  sourceContent: { color: Theme.colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
});
