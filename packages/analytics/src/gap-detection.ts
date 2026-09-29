import type { DataGap, StationId } from '@weather/domain';

export interface GapScanPoint {
  readonly timestamp: Date;
  /** True when the outdoor sensor reported a value at this interval. */
  readonly usable: boolean;
}

/**
 * Incremental gap finder. Feed points in time order (in chunks, if the range is
 * large), then call `finish`. A gap is any span longer than `minGapMs` between
 * usable readings, including at the start or end of the range.
 */
export class GapScanner {
  private lastUsable: Date;
  private unusableSinceLast = 0;
  private readonly gaps: DataGap[] = [];

  constructor(
    private readonly stationId: StationId,
    private readonly rangeStart: Date,
    private readonly minGapMs: number,
  ) {
    this.lastUsable = rangeStart;
  }

  add(points: readonly GapScanPoint[]): void {
    for (const p of points) {
      if (!p.usable) {
        this.unusableSinceLast++;
        continue;
      }
      this.close(p.timestamp);
      this.lastUsable = p.timestamp;
      this.unusableSinceLast = 0;
    }
  }

  finish(rangeEnd: Date): DataGap[] {
    this.close(rangeEnd);
    return [...this.gaps];
  }

  private close(until: Date): void {
    if (until.getTime() - this.lastUsable.getTime() <= this.minGapMs) return;
    this.gaps.push({
      stationId: this.stationId,
      from: this.lastUsable,
      to: until,
      kind: this.unusableSinceLast > 0 ? 'sensor-fault' : 'no-data',
      recordsWithoutData: this.unusableSinceLast,
    });
  }
}
