/**
 * Static hosting (GitHub Pages): the site is built with VITE_STATIC=true and
 * reads a JSON snapshot under `data/` instead of calling the API.
 */
export const IS_STATIC = import.meta.env.VITE_STATIC === 'true';

export function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/${path}`;
}

/** The snapshot's series windows (hours), matching `apps/api/src/snapshot.ts`. */
export const SNAPSHOT_SERIES_HOURS = [24, 168, 720];

export function nearestSnapshotHours(from: string, to: string): number {
  const hours = (Date.parse(to) - Date.parse(from)) / 3_600_000;
  return SNAPSHOT_SERIES_HOURS.reduce((best, h) => (Math.abs(h - hours) < Math.abs(best - hours) ? h : best));
}
