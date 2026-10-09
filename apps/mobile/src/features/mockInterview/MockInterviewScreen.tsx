import * as Speech from 'expo-speech';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '../../components/AppText';
import { AppIcon } from '../../components/AppIcon';
import { AppPressable as Pressable, triggerAppHaptic } from '../../components/AppPressable';
import { FadeInView, animateNextLayout } from '../../components/Motion';
import type {
  AiServiceSettings,
  Job,
  MockInterviewSession,
  MockInterviewTurn,
  TencentAsrCredentials,
} from '../../types';
import { persistAudioFile } from '../../services/audioFiles';
import { transcribeInterviewAudio } from '../../services/aiService';
import { generateMockInterviewQuestion, reviewMockInterview } from '../../services/mockInterview';
import { interviewRecordingOptions } from '../../services/recordingOptions';
import { SCREEN_TOP_GAP } from '../../theme';

type Screen = 'home' | 'setup' | 'session' | 'report';

export function MockInterviewScreen({
  visible,
  jobs,
  sessions,
  aiSettings,
  apiKey,
  tencentCredentials,
  onUpsertSession,
  onClose,
}: {
  visible: boolean;
  jobs: Job[];
  sessions: MockInterviewSession[];
  aiSettings: AiServiceSettings;
  apiKey: string;
  tencentCredentials: TencentAsrCredentials;
  onUpsertSession: (session: MockInterviewSession) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(interviewRecordingOptions);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedJobId, setSelectedJobId] = useState<number | null>(jobs[0]?.id ?? null);
  const [round, setRound] = useState('技术一面');
  const [questionCount, setQuestionCount] = useState(5);
  const [activeSession, setActiveSession] = useState<MockInterviewSession | null>(null);
  const [busy, setBusy] = useState<'question' | 'transcribing' | 'reviewing' | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
  const answerStartedAtRef = useRef(0);
  const firstSpeechAtRef = useRef(0);
  const pauseStartedAtRef = useRef(0);
  const pauseDurationsRef = useRef<number[]>([]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );
  const currentTurn = activeSession?.turns.at(-1) ?? null;

  const navigate = (next: Screen) => {
    animateNextLayout();
    setScreen(next);
  };

  useEffect(() => {
    const metering = recorderState.metering;
    if (!isRecording || typeof metering !== 'number') return;
    const now = Date.now();
    if (metering > -50) {
      if (!firstSpeechAtRef.current) firstSpeechAtRef.current = now;
      if (pauseStartedAtRef.current) {
        const pauseDuration = now - pauseStartedAtRef.current;
        if (pauseDuration >= 1_200) pauseDurationsRef.current.push(pauseDuration);
        pauseStartedAtRef.current = 0;
      }
      return;
    }
    if (firstSpeechAtRef.current && !pauseStartedAtRef.current) {
      pauseStartedAtRef.current = now;
    }
  }, [isRecording, recorderState.metering]);

  function upsert(session: MockInterviewSession) {
    setActiveSession(session);
    onUpsertSession(session);
  }

  async function speakQuestion(question: string) {
    await Speech.stop();
    Speech.speak(question, { language: 'zh-CN', rate: 0.92, pitch: 1 });
  }

  async function startSession() {
    setError('');
    setBusy('question');
    try {
      const question = await generateMockInterviewQuestion({
        job: selectedJob,
        round,
        turns: [],
        settings: aiSettings,
        apiKey,
      });
      const now = new Date().toISOString();
      const session: MockInterviewSession = {
        id: `mock-${Date.now()}`,
        jobId: selectedJob?.id ?? null,
        title: selectedJob?.title ?? '通用模拟面试',
        round,
        status: 'active',
        targetQuestionCount: questionCount,
        turns: [createTurn(question)],
        report: null,
        createdAt: now,
        completedAt: '',
      };
      upsert(session);
      navigate('session');
      await speakQuestion(question);
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function startAnswer() {
    if (!currentTurn || currentTurn.audioUri || busy) return;
    setError('');
    await Speech.stop();
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要麦克风权限', '授权后才能进行语音模拟面试。');
      return;
    }
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: false,
        interruptionMode: 'doNotMix',
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync(interviewRecordingOptions);
      recorder.record();
      answerStartedAtRef.current = Date.now();
      firstSpeechAtRef.current = 0;
      pauseStartedAtRef.current = 0;
      pauseDurationsRef.current = [];
      setIsRecording(true);
    } catch (caught) {
      showError(caught);
    }
  }

  async function stopAnswer() {
    if (!isRecording || !activeSession || !currentTurn) return;
    try {
      const durationMillis = recorderState.durationMillis;
      await recorder.stop();
      setIsRecording(false);
      const sourceUri = recorder.uri;
      if (!sourceUri) throw new Error('回答录音结束后没有生成音频文件。');
      const fileName = `MockInterview-${Date.now()}.m4a`;
      const saved = await persistAudioFile(sourceUri, fileName, durationMillis);
      const responseLatencyMillis = firstSpeechAtRef.current
        ? Math.max(0, firstSpeechAtRef.current - answerStartedAtRef.current)
        : durationMillis;
      if (pauseStartedAtRef.current) {
        const trailingPause = Date.now() - pauseStartedAtRef.current;
        if (trailingPause >= 1_200) pauseDurationsRef.current.push(trailingPause);
      }
      const savedSession = updateCurrentTurn(activeSession, {
        audioUri: saved.uri,
        durationMillis,
        responseLatencyMillis,
        longPauseCount: pauseDurationsRef.current.length,
        longestPauseMillis: Math.max(0, ...pauseDurationsRef.current),
      });
      upsert(savedSession);
      await processCurrentAnswer(savedSession);
    } catch (caught) {
      setIsRecording(false);
      showError(caught);
    }
  }

  async function processCurrentAnswer(session: MockInterviewSession) {
    const turn = session.turns.at(-1);
    if (!turn?.audioUri) return;
    setError('');
    setBusy('transcribing');
    try {
      const transcript = await transcribeInterviewAudio({
        audioUri: turn.audioUri,
        audioName: turn.audioUri.split('/').at(-1) ?? 'mock-answer.m4a',
        settings: aiSettings,
        apiKey,
        tencentCredentials,
      });
      const completedTurn = {
        transcript,
        fillerCount: countFillers(transcript),
        speechRate: calculateSpeechRate(transcript, turn.durationMillis),
      };
      const completedSession = updateCurrentTurn(session, completedTurn);
      upsert(completedSession);

      if (completedSession.turns.length >= completedSession.targetQuestionCount) {
        await finishSession(completedSession);
        return;
      }

      setBusy('question');
      const job = jobs.find((item) => item.id === completedSession.jobId) ?? null;
      const question = await generateMockInterviewQuestion({
        job,
        round: completedSession.round,
        turns: completedSession.turns,
        settings: aiSettings,
        apiKey,
      });
      const nextSession = { ...completedSession, turns: [...completedSession.turns, createTurn(question)] };
      upsert(nextSession);
      await speakQuestion(question);
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function finishSession(session: MockInterviewSession) {
    setBusy('reviewing');
    const job = jobs.find((item) => item.id === session.jobId) ?? null;
    const report = await reviewMockInterview({
      job,
      round: session.round,
      turns: session.turns,
      settings: aiSettings,
      apiKey,
    });
    const completed = {
      ...session,
      status: 'completed' as const,
      report,
      completedAt: new Date().toISOString(),
    };
    upsert(completed);
    navigate('report');
    triggerAppHaptic('success');
  }

  function openSession(session: MockInterviewSession) {
    setActiveSession(session);
    setError('');
    navigate(session.status === 'completed' ? 'report' : 'session');
    const turn = session.turns.at(-1);
    if (session.status === 'active' && turn && !turn.audioUri) {
      speakQuestion(turn.question).catch(() => undefined);
    }
  }

  function close() {
    if (isRecording) {
      Alert.alert('回答仍在录音', '请先停止并保存本题回答。');
      return;
    }
    Speech.stop().catch(() => undefined);
    onClose();
  }

  function showError(caught: unknown) {
    const detail = caught instanceof Error ? caught.message : '未知错误';
    setError(detail);
    Alert.alert('模拟面试未完成', detail);
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close}>
      <View style={[styles.safeArea, { paddingTop: insets.top + SCREEN_TOP_GAP, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable onPress={screen === 'home' ? close : () => navigate('home')}>
            <AppIcon name={screen === 'home' ? 'close' : 'back'} size={screen === 'home' ? 22 : 24} color="#2B3935" />
          </Pressable>
          <Text style={styles.headerTitle}>模拟面试</Text>
          <View style={styles.headerPlaceholder} />
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <FadeInView key={screen}>
          {screen === 'home' ? (
            <>
              <View style={styles.hero}>
                <Text style={styles.heroTitle}>准备好练习了吗？</Text>
                <Text style={styles.muted}>选择岗位和轮次，逐题完成语音练习。</Text>
                <Pressable style={styles.primaryButton} onPress={() => navigate('setup')}>
                  <Text style={styles.primaryButtonText}>开始练习</Text>
                </Pressable>
              </View>
              <SectionTitle title="最近练习" />
              {sessions.length ? sessions.map((session) => (
                <Pressable key={session.id} style={styles.listRow} onPress={() => openSession(session)}>
                  <View style={styles.flexOne}>
                    <Text style={styles.rowTitle}>{session.title}</Text>
                    <Text style={styles.muted}>{session.round} · {session.turns.length}/{session.targetQuestionCount} 题 · {session.status === 'completed' ? '已复盘' : '进行中'}</Text>
                  </View>
                  <AppIcon name="chevron" size={18} color="#9CA3AF" />
                </Pressable>
              )) : <Text style={styles.empty}>还没有模拟面试记录。</Text>}
            </>
          ) : null}

          {screen === 'setup' ? (
            <>
              <SectionTitle title="目标岗位" />
              <View style={styles.selectionField}>
                <View style={styles.chipWrap}>
                  <Chip label="通用岗位" active={selectedJobId === null} onPress={() => setSelectedJobId(null)} />
                  {jobs.map((job) => (
                    <Chip key={job.id} label={`${job.company} · ${job.title}`} active={selectedJobId === job.id} onPress={() => setSelectedJobId(job.id)} />
                  ))}
                </View>
              </View>
              <SectionTitle title="面试轮次" />
              <View style={styles.segmentedOptions}>
                {['HR 面', '技术一面', '主管面'].map((item) => <Chip equal key={item} label={item} active={round === item} onPress={() => setRound(item)} />)}
              </View>
              <SectionTitle title="问题数量" />
              <View style={styles.segmentedOptions}>
                {[3, 5, 8].map((count) => <Chip equal key={count} label={`${count} 题`} active={questionCount === count} onPress={() => setQuestionCount(count)} />)}
              </View>
              <Pressable style={[styles.primaryButton, busy && styles.disabled]} disabled={Boolean(busy)} onPress={startSession}>
                <Text style={styles.primaryButtonText}>{busy === 'question' ? '正在准备第一题…' : '开始模拟面试'}</Text>
              </Pressable>
            </>
          ) : null}

          {screen === 'session' && activeSession && currentTurn ? (
            <>
              <Text style={styles.progress}>第 {activeSession.turns.length} / {activeSession.targetQuestionCount} 题</Text>
              <View style={styles.questionBlock}>
                <Text style={styles.question}>{currentTurn.question}</Text>
                <Pressable style={styles.speakButton} onPress={() => speakQuestion(currentTurn.question)}>
                  <Text style={styles.speakButtonText}>重新播放</Text>
                </Pressable>
              </View>
              <View style={[styles.recordBlock, isRecording && styles.recordBlockActive]}>
                <Text style={styles.timer}>{formatDuration(recorderState.durationMillis)}</Text>
                <Text style={styles.muted}>{isRecording ? '正在记录你的回答' : currentTurn.audioUri ? '本题音频已保存' : '准备好后开始回答'}</Text>
                <Pressable
                  haptic="light"
                  style={[styles.recordButton, isRecording && styles.stopButton, busy && styles.disabled]}
                  disabled={Boolean(busy)}
                  onPress={isRecording ? stopAnswer : currentTurn.audioUri ? () => processCurrentAnswer(activeSession) : startAnswer}
                >
                  <Text style={styles.recordButtonText}>
                    {isRecording ? '停止并保存' : currentTurn.audioUri ? '重新处理本题' : '开始回答'}
                  </Text>
                </Pressable>
              </View>
              {busy ? <Text style={styles.busy}>{busy === 'transcribing' ? '正在转写本题回答…' : busy === 'reviewing' ? '正在生成本次复盘…' : '正在准备下一题…'}</Text> : null}
              {currentTurn.transcript ? (
                <View style={styles.transcriptBlock}>
                  <Text style={styles.rowTitle}>本题回答</Text>
                  <Text style={styles.transcript}>{currentTurn.transcript}</Text>
                </View>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          ) : null}

          {screen === 'report' && activeSession ? <MockReport session={activeSession} /> : null}
          </FadeInView>
        </ScrollView>
      </View>
    </Modal>
  );
}

function MockReport({ session }: { session: MockInterviewSession }) {
  const report = session.report;
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const [progressWidth, setProgressWidth] = useState(0);
  const shouldAutoplayRef = useRef(false);
  const player = useAudioPlayer(playbackUri ? { uri: playbackUri } : null, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    if (!playbackUri || !shouldAutoplayRef.current) return;
    shouldAutoplayRef.current = false;
    player.play();
  }, [playbackUri, player]);

  async function togglePlayback(audioUri: string) {
    if (playbackUri !== audioUri) {
      shouldAutoplayRef.current = true;
      setPlaybackUri(audioUri);
      return;
    }
    if (playerStatus.playing) {
      player.pause();
      return;
    }
    if (playerStatus.didJustFinish || playerStatus.currentTime >= playerStatus.duration) {
      await player.seekTo(0);
    }
    player.play();
  }

  async function seekPlayback(locationX: number) {
    if (!progressWidth || !playerStatus.duration) return;
    const ratio = Math.max(0, Math.min(1, locationX / progressWidth));
    await player.seekTo(playerStatus.duration * ratio);
  }

  return (
    <>
      <Text style={styles.reportTitle}>本次模拟复盘</Text>
      <Text style={styles.reportOverall}>{report?.overall ?? '复盘尚未生成。'}</Text>
      <ReportList title="做得较好的地方" items={report?.strengths ?? []} />
      <ReportList title="需要留意" items={report?.risks ?? []} />
      <ReportList title="下一步练习" items={report?.nextSteps ?? []} />
      <SectionTitle title="逐题记录" />
      {session.turns.map((turn, index) => (
        <View style={styles.turnBlock} key={turn.id}>
          <Text style={styles.rowTitle}>第 {index + 1} 题 · {turn.question}</Text>
          <Text style={styles.transcript}>{turn.transcript || '尚未完成转写'}</Text>
          {turn.audioUri ? (
            <View style={styles.playbackRow}>
              <Pressable style={styles.playbackButton} onPress={() => void togglePlayback(turn.audioUri!)}>
                <Text style={styles.playbackButtonText}>
                  {playbackUri === turn.audioUri && playerStatus.playing ? '暂停' : '播放'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.progressTrack}
                onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
                onPress={(event) => void seekPlayback(event.nativeEvent.locationX)}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: playbackUri === turn.audioUri && playerStatus.duration
                        ? `${Math.min(100, (playerStatus.currentTime / playerStatus.duration) * 100)}%`
                        : '0%',
                    },
                  ]}
                />
              </Pressable>
              <Text style={styles.playbackTime}>
                {playbackUri === turn.audioUri
                  ? `${formatSeconds(playerStatus.currentTime)} / ${formatSeconds(playerStatus.duration)}`
                  : formatDuration(turn.durationMillis)}
              </Text>
            </View>
          ) : null}
          <Text style={styles.metrics}>起答 {(turn.responseLatencyMillis / 1000).toFixed(1)}s · 长停顿 {turn.longPauseCount} 次 · {turn.speechRate} 字/分钟 · 填充词 {turn.fillerCount} 次</Text>
          {getTurnSignals(turn).length ? (
            <View style={styles.signalWrap}>
              {getTurnSignals(turn).map((signal) => <Text key={signal} style={styles.signal}>{signal}</Text>)}
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.reportBlock}>
      <Text style={styles.rowTitle}>{title}</Text>
      {items.map((item, index) => <Text style={styles.reportItem} key={`${item}-${index}`}>{index + 1}. {item}</Text>)}
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function Chip({ label, active, equal = false, onPress }: { label: string; active: boolean; equal?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, equal && styles.equalChip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function createTurn(question: string): MockInterviewTurn {
  return {
    id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    question,
    audioUri: null,
    transcript: '',
    durationMillis: 0,
    responseLatencyMillis: 0,
    longPauseCount: 0,
    longestPauseMillis: 0,
    fillerCount: 0,
    speechRate: 0,
    createdAt: new Date().toISOString(),
  };
}

function updateCurrentTurn(session: MockInterviewSession, patch: Partial<MockInterviewTurn>) {
  const turns = session.turns.map((turn, index) => index === session.turns.length - 1 ? { ...turn, ...patch } : turn);
  return { ...session, turns };
}

function countFillers(text: string) {
  return (text.match(/(?:嗯+|呃+|额+|然后|就是|那个|这个)/gu) ?? []).length;
}

function calculateSpeechRate(text: string, durationMillis: number) {
  if (durationMillis <= 0) return 0;
  const characters = text.replace(/[\s\p{P}\p{S}]/gu, '').length;
  return Math.round(characters / (durationMillis / 60_000));
}

function formatDuration(valueMillis: number) {
  const totalSeconds = Math.max(0, Math.floor(valueMillis / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatSeconds(valueSeconds: number) {
  return formatDuration(Math.max(0, valueSeconds) * 1000);
}

function getTurnSignals(turn: MockInterviewTurn) {
  const signals: string[] = [];
  const transcriptLength = turn.transcript.replace(/[\s\p{P}\p{S}]/gu, '').length;
  if (turn.responseLatencyMillis >= 5_000) signals.push('起答较慢');
  if (turn.longPauseCount >= 2) signals.push('多次长停顿');
  if (turn.transcript && transcriptLength < 30) signals.push('回答较短');
  if (turn.fillerCount >= 5) signals.push('填充词偏多');
  return signals;
}

const colors = {
  bg: '#F6F5F3',
  surface: '#FFFFFF',
  soft: '#EEF1EE',
  primary: '#77877F',
  deep: '#2B3935',
  text: '#232927',
  muted: '#707773',
  border: '#E5E2DD',
  risk: '#A96E66',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 8 },
  headerAction: { width: 52, color: colors.deep, fontSize: 32, lineHeight: 36, fontWeight: '400' },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  headerPlaceholder: { width: 52 },
  content: { padding: 18, paddingBottom: 60, gap: 14 },
  hero: { gap: 10, paddingVertical: 10 },
  heroTitle: { color: colors.text, fontSize: 20, lineHeight: 27, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 10, backgroundColor: colors.deep },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  sectionTitle: { marginTop: 12, color: colors.text, fontSize: 17, fontWeight: '800' },
  listRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  flexOne: { flex: 1, gap: 4 },
  rowTitle: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '800' },
  chevron: { color: colors.primary, fontSize: 24 },
  empty: { paddingVertical: 24, color: colors.muted, fontSize: 14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectionField: { paddingVertical: 2 },
  segmentedOptions: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 8, backgroundColor: colors.soft },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  equalChip: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  chipActive: { borderColor: colors.deep, backgroundColor: colors.deep },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.surface },
  progress: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  questionBlock: { gap: 16, paddingVertical: 18 },
  question: { color: colors.text, fontSize: 24, lineHeight: 35, fontWeight: '800' },
  speakButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.soft },
  speakButtonText: { color: colors.deep, fontSize: 13, fontWeight: '700' },
  recordBlock: { alignItems: 'center', gap: 10, paddingVertical: 24, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  recordBlockActive: { borderColor: '#C8D6CE' },
  timer: { color: colors.text, fontSize: 38, fontWeight: '800' },
  recordButton: { minWidth: 170, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6, borderRadius: 25, backgroundColor: colors.deep },
  stopButton: { backgroundColor: colors.risk },
  recordButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  busy: { textAlign: 'center', color: colors.primary, fontSize: 14, fontWeight: '700' },
  transcriptBlock: { gap: 8, paddingVertical: 8 },
  transcript: { color: colors.text, fontSize: 15, lineHeight: 24 },
  error: { color: colors.risk, fontSize: 13, lineHeight: 20 },
  reportTitle: { color: colors.text, fontSize: 27, fontWeight: '800' },
  reportOverall: { color: colors.text, fontSize: 17, lineHeight: 27 },
  reportBlock: { gap: 8, paddingVertical: 10 },
  reportItem: { color: colors.text, fontSize: 14, lineHeight: 22 },
  turnBlock: { gap: 7, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  metrics: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  playbackRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 },
  playbackButton: { minWidth: 52, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.soft },
  playbackButtonText: { color: colors.deep, fontSize: 12, fontWeight: '800' },
  progressTrack: { flex: 1, height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: colors.border },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  playbackTime: { minWidth: 76, color: colors.muted, fontSize: 11, textAlign: 'right' },
  signalWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  signal: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, color: colors.risk, backgroundColor: '#F5EDEA', fontSize: 11, fontWeight: '700' },
});
