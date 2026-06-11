import { Song, Comment } from '../../app/services/song.service';
export type { Song, Comment };

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return fallback;
}

export function isSongPublic(song: Song): boolean {
  return toBoolean(song.isPublic, true);
}

export function isSongOwnedByViewer(song: Song, viewerId?: number | null): boolean {
  if (viewerId == null) return false;
  return toNumberOrNull(song.ownerId) === viewerId;
}

export function normalizeSong(song: Song): Song {
  return {
    ...song,
    ownerId: toNumberOrNull(song.ownerId),
    isPublic: toBoolean(song.isPublic, true),
    likeCount: typeof song.likeCount === 'string' ? parseInt(song.likeCount, 10) : (song.likeCount ?? 0),
    playCount: typeof song.playCount === 'string' ? parseInt(song.playCount, 10) : (song.playCount ?? 0)
  };
}
