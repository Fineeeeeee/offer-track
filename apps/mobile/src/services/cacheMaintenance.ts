import * as FileSystem from 'expo-file-system/legacy';

const GENERIC_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const APP_CACHE_FILE = /^(?:offerjing-|OfferJing-)/;

export type CacheInspection = {
  removableBytes: number;
  removableFiles: number;
  protectedBytes: number;
  protectedFiles: number;
};

type CacheEntry = {
  uri: string;
  size: number;
  modificationTime: number;
};

export async function inspectDisposableCache(now = Date.now()): Promise<CacheInspection> {
  const entries = await listCacheFiles();
  return entries.reduce<CacheInspection>((summary, entry) => {
    const removable = isDisposableEntry(entry, now);
    if (removable) {
      summary.removableBytes += entry.size;
      summary.removableFiles += 1;
    } else {
      summary.protectedBytes += entry.size;
      summary.protectedFiles += 1;
    }
    return summary;
  }, { removableBytes: 0, removableFiles: 0, protectedBytes: 0, protectedFiles: 0 });
}

export async function clearDisposableCache(now = Date.now()) {
  const entries = await listCacheFiles();
  const removable = entries.filter((entry) => isDisposableEntry(entry, now));
  await Promise.all(removable.map((entry) => FileSystem.deleteAsync(entry.uri, { idempotent: true })));
  return {
    clearedBytes: removable.reduce((sum, entry) => sum + entry.size, 0),
    clearedFiles: removable.length,
  };
}

export function isDisposableCacheFile(
  name: string,
  modificationTimeSeconds: number,
  now = Date.now(),
) {
  if (APP_CACHE_FILE.test(name)) return true;
  if (!modificationTimeSeconds) return false;
  return now - modificationTimeSeconds * 1000 >= GENERIC_CACHE_MAX_AGE_MS;
}

async function listCacheFiles() {
  if (!FileSystem.cacheDirectory) return [];
  const info = await FileSystem.getInfoAsync(FileSystem.cacheDirectory);
  if (!info.exists) return [];
  return walkDirectory(FileSystem.cacheDirectory);
}

async function walkDirectory(directoryUri: string): Promise<CacheEntry[]> {
  const names = await FileSystem.readDirectoryAsync(directoryUri);
  const nested = await Promise.all(names.map(async (name) => {
    const uri = `${directoryUri}${directoryUri.endsWith('/') ? '' : '/'}${name}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return [];
    if (info.isDirectory) return walkDirectory(`${uri}/`);
    return [{
      uri,
      size: 'size' in info && typeof info.size === 'number' ? info.size : 0,
      modificationTime: 'modificationTime' in info && typeof info.modificationTime === 'number'
        ? info.modificationTime
        : 0,
    }];
  }));
  return nested.flat();
}

function isDisposableEntry(entry: CacheEntry, now: number) {
  const name = decodeURIComponent(entry.uri.split('/').pop() ?? '');
  return isDisposableCacheFile(name, entry.modificationTime, now);
}
