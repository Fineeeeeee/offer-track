export function omitRecordKeys<T>(record: Record<number, T>, ids: number[]) {
  if (!ids.length) return record;
  const next = { ...record };
  ids.forEach((id) => delete next[id]);
  return next;
}
