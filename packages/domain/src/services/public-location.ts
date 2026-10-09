/**
 * How much of the station's position a public page may show.
 * - exact: the coordinates as recorded
 * - approximate: snapped to a 0.1° grid, so only the area (about a town) is known
 * - hidden: no position at all
 */
export type LocationVisibility = 'exact' | 'approximate' | 'hidden';

export interface PublicLocation {
  latitude: number;
  longitude: number;
  /** How far the real spot can be from the shown one (0 when exact). */
  radiusMetres: number;
}

const GRID_DEGREES = 0.1;
const METRES_PER_DEGREE = 111_320;

export function publicLocation(
  latitude: number | null,
  longitude: number | null,
  visibility: LocationVisibility,
): PublicLocation | null {
  if (latitude === null || longitude === null || visibility === 'hidden') return null;
  if (visibility === 'exact') return { latitude, longitude, radiusMetres: 0 };

  const snap = (v: number) => Math.round(Math.round(v / GRID_DEGREES) * GRID_DEGREES * 10) / 10;
  const lat = snap(latitude);
  const lon = snap(longitude);
  // Half a grid cell each way, to the cell's corner.
  const half = (GRID_DEGREES / 2) * METRES_PER_DEGREE;
  const radiusMetres = Math.ceil(Math.hypot(half, half * Math.cos((lat * Math.PI) / 180)));
  return { latitude: lat, longitude: lon, radiusMetres };
}
