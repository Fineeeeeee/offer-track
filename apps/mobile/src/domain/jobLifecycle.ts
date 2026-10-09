import type {
  ApplicationEvent,
  HrAnswerRecord,
  Interview,
  InterviewDraft,
  Job,
  JobNote,
} from '../types';
import { resolveInterviewDateTime } from './interviewDateTime';

export type JobDateBasis = 'activity' | 'applied' | 'interview' | 'closed' | 'created';
export type DateRangePreset = '30d' | '90d' | 'year' | 'custom' | 'all';

export type DateRangeValue = {
  preset: DateRangePreset;
  startDate: string;
  endDate: string;
};

export const defaultDateRange: DateRangeValue = { preset: '90d', startDate: '', endDate: '' };

export type JobLifecycleInput = {
  job: Job;
  note?: Partial<JobNote>;
  events?: ApplicationEvent[];
  interviews?: Interview[];
  interviewDrafts?: Record<number, InterviewDraft>;
  hrAnswers?: HrAnswerRecord[];
};

export function getJobDate(input: JobLifecycleInput, basis: JobDateBasis, now = new Date()) {
  const dates = getJobLifecycleDates(input, now);
  return dates[basis];
}

export function getJobLifecycleDates(input: JobLifecycleInput, now = new Date()) {
  const events = input.events ?? [];
  const interviews = input.interviews ?? [];
  const note = input.note ?? {};
  const created = dateFromTimestampId(input.job.id)
    ?? earliest(events.map((event) => parseDateValue(event.eventTime, now)))
    ?? parseDateValue(note.recordDate, now);
  const applied = parseDateValue(note.applicationDate, now)
    ?? earliest(events
      .filter((event) => ['applied', 'responded', 'interviewing', 'offered', 'ended'].includes(event.toStatus))
      .map((event) => parseDateValue(event.eventTime, now)))
    ?? (['applied', 'responded', 'interviewing', 'offered', 'ended'].includes(input.job.status)
      ? parseDateValue(note.recordDate, now)
      : null);
  const interview = latest(interviews.map((item) => resolveInterviewDateTime(item.startsAt, item.id, now)));
  const closed = latest(events
    .filter((event) => event.toStatus === 'ended')
    .map((event) => parseDateValue(event.eventTime, now)));
  const activity = latest([
    created,
    applied,
    interview,
    closed,
    parseDateValue(joinRecordDate(note.recordDate, note.recordTime), now),
    ...events.map((event) => parseDateValue(event.eventTime, now)),
    ...(input.hrAnswers ?? []).map((answer) => parseDateValue(answer.createdAt, now)),
    ...interviews.flatMap((item) => {
      const draft = input.interviewDrafts?.[item.id];
      return [
        resolveInterviewDateTime(item.startsAt, item.id, now),
        parseDateValue(draft?.transcriptionUpdatedAt, now),
      ];
    }),
  ]);

  return { activity, applied, interview, closed, created };
}

export function isDateInRange(date: Date | null, range: DateRangeValue, now = new Date()) {
  if (range.preset === 'all') return true;
  if (!date) return false;
  const customStart = range.preset === 'custom' ? parseDateValue(range.startDate, now) : null;
  const customEnd = range.preset === 'custom' ? parseDateValue(range.endDate, now) ?? now : now;
  const end = endOfDay(customStart && customStart > customEnd ? customStart : customEnd);
  let start: Date;
  if (range.preset === 'custom') {
    if (!customStart) return false;
    start = startOfDay(customStart > customEnd ? customEnd : customStart);
  } else if (range.preset === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    start = startOfDay(new Date(now));
    start.setDate(start.getDate() - (range.preset === '30d' ? 29 : 89));
  }
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

export function isArchiveCandidate(input: JobLifecycleInput, now = new Date(), inactiveDays = 180) {
  if (input.job.status !== 'ended') return false;
  const activity = getJobLifecycleDates(input, now).activity;
  if (!activity) return false;
  return now.getTime() - activity.getTime() >= inactiveDays * 24 * 60 * 60 * 1000;
}

export function formatActivityDate(date: Date | null) {
  if (!date) return '日期待确认';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDateValue(value: unknown, now = new Date()): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const relative = text.match(/^(今天|明天|昨天)(?:\s+(\d{1,2}):(\d{2}))?/u);
  if (relative) {
    const date = new Date(now);
    date.setHours(Number(relative[2] ?? 0), Number(relative[3] ?? 0), 0, 0);
    if (relative[1] === '明天') date.setDate(date.getDate() + 1);
    if (relative[1] === '昨天') date.setDate(date.getDate() - 1);
    return date;
  }
  const chineseDate = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?(?:\s+(\d{1,2}):(\d{2}))?/u);
  if (chineseDate) {
    const date = new Date(
      Number(chineseDate[1] ?? now.getFullYear()),
      Number(chineseDate[2]) - 1,
      Number(chineseDate[3]),
      Number(chineseDate[4] ?? 0),
      Number(chineseDate[5] ?? 0),
    );
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const normalized = text.replace(/\./gu, '-').replace(/\//gu, '-');
  const parsed = new Date(normalized.includes('T') ? normalized : normalized.replace(/\s+/u, 'T'));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dateFromTimestampId(id: number) {
  const earliestTimestamp = new Date('2020-01-01T00:00:00Z').getTime();
  const latestTimestamp = new Date('2100-01-01T00:00:00Z').getTime();
  if (id < earliestTimestamp || id > latestTimestamp) return null;
  return new Date(id);
}

function joinRecordDate(date?: string, time?: string) {
  return [date, time].filter(Boolean).join(' ');
}

function earliest(values: Array<Date | null>) {
  const valid = values.filter((value): value is Date => Boolean(value));
  return valid.length ? new Date(Math.min(...valid.map((value) => value.getTime()))) : null;
}

function latest(values: Array<Date | null>) {
  const valid = values.filter((value): value is Date => Boolean(value));
  return valid.length ? new Date(Math.max(...valid.map((value) => value.getTime()))) : null;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}
