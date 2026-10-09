const RELATIVE_DATE = /^(今天|今日|明天|明日|昨天|昨日)(?:\s*(?:上午|下午|晚上)?)?\s*(\d{1,2})?(?::(\d{2}))?/u;

export function parseInterviewDateTime(value: string, referenceDate = new Date()): Date | null {
  const text = value.trim();
  if (!text || text === '待定') return null;

  const relative = text.match(RELATIVE_DATE);
  if (relative) {
    const result = startOfDay(referenceDate);
    if (relative[1] === '明天' || relative[1] === '明日') result.setDate(result.getDate() + 1);
    if (relative[1] === '昨天' || relative[1] === '昨日') result.setDate(result.getDate() - 1);
    let hour = Number(relative[2] ?? 9);
    if (/(?:下午|晚上)/u.test(text) && hour < 12) hour += 12;
    result.setHours(hour, Number(relative[3] ?? 0), 0, 0);
    return result;
  }

  const chinese = text.match(/(?:(\d{4})[年-])?(\d{1,2})[月.-](\d{1,2})日?(?:[ T]?)(\d{1,2})?(?::(\d{2}))?/u);
  if (chinese) {
    const result = new Date(
      Number(chinese[1] ?? referenceDate.getFullYear()),
      Number(chinese[2]) - 1,
      Number(chinese[3]),
      Number(chinese[4] ?? 9),
      Number(chinese[5] ?? 0),
      0,
      0,
    );
    return isValidDate(result) ? result : null;
  }

  const normalized = text.replace(/\./gu, '-').replace(/\//gu, '-').replace(/\s+/u, 'T');
  const parsed = new Date(normalized);
  return isValidDate(parsed) ? parsed : null;
}

export function resolveInterviewDateTime(value: string, recordId?: number, now = new Date()) {
  return parseInterviewDateTime(value, getRecordReferenceDate(recordId, now));
}

export function normalizeInterviewDateTime(value: string, referenceDate = new Date()) {
  const parsed = parseInterviewDateTime(value, referenceDate);
  return parsed ? formatInterviewDateTimeStorage(parsed) : value.trim();
}

export function formatInterviewDateTimeStorage(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function formatInterviewSchedule(value: string, recordId?: number, now = new Date()) {
  const date = resolveInterviewDateTime(value, recordId, now);
  if (!date) return value.trim() || '时间待定';
  const dayDelta = calendarDayDifference(date, now);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (dayDelta === 0) return `今天 ${time}`;
  if (dayDelta === 1) return `明天 ${time}`;
  if (dayDelta === -1) return `昨天 ${time}`;
  const weekday = '日一二三四五六'[date.getDay()];
  const year = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`;
  return `${year}${date.getMonth() + 1}月${date.getDate()}日 周${weekday} ${time}`;
}

export function formatInterviewDateChoice(value: Date, now = new Date()) {
  const dayDelta = calendarDayDifference(value, now);
  const relative = dayDelta === 0 ? '今天' : dayDelta === 1 ? '明天' : '';
  return `${value.getMonth() + 1}月${value.getDate()}日${relative ? ` · ${relative}` : ''}`;
}

export function formatInterviewCountdown(value: string, recordId?: number, now = new Date()) {
  const date = resolveInterviewDateTime(value, recordId, now);
  if (!date) return '时间待定';
  const diffMinutes = Math.ceil((date.getTime() - now.getTime()) / 60_000);
  if (diffMinutes <= 0) return '已到时间';
  if (diffMinutes < 60) return `${diffMinutes} 分钟后`;
  const dayDelta = calendarDayDifference(date, now);
  if (dayDelta === 0) return '今天';
  if (dayDelta === 1) return '明天';
  return `${dayDelta} 天后`;
}

export function getDefaultInterviewDateTime(now = new Date()) {
  const result = new Date(now);
  result.setSeconds(0, 0);
  result.setMinutes(result.getMinutes() < 30 ? 30 : 0);
  if (now.getMinutes() >= 30) result.setHours(result.getHours() + 1);
  return result;
}

function getRecordReferenceDate(recordId: number | undefined, now: Date) {
  if (!recordId) return now;
  const earliest = new Date('2020-01-01T00:00:00').getTime();
  const latest = new Date('2100-01-01T00:00:00').getTime();
  return recordId >= earliest && recordId <= latest ? new Date(recordId) : now;
}

function calendarDayDifference(value: Date, now: Date) {
  return Math.round((startOfDay(value).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
