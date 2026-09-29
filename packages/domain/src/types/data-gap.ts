import type { StationId } from './ids.js';

/**
 * A stretch with no usable outdoor readings.
 * `no-data`: nothing was logged at all (console or connection down).
 * `sensor-fault`: archive records exist but the outdoor sensor reported nothing
 * (for example the ISS lost power or radio contact).
 */
export type DataGapKind = 'no-data' | 'sensor-fault';

export interface DataGap {
  readonly stationId: StationId;
  /** Last usable reading before the gap (or the start of the checked range). */
  readonly from: Date;
  /** First usable reading after the gap (or the end of the checked range). */
  readonly to: Date;
  readonly kind: DataGapKind;
  /** Archive records logged inside the gap without usable outdoor data. */
  readonly recordsWithoutData: number;
}
