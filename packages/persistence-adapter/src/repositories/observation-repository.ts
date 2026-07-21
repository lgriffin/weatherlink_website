import { eq, and, gte, lte, desc } from 'drizzle-orm';
import type {
  ObservationRepository,
  Observation,
  StationId,
  Measurement,
} from '@weather/domain';
import { observationId, stationId, sensorId } from '@weather/domain';
import type { Database } from '../db.js';
import { observations } from '../schema/observations.js';
import type { ObservationSource, MeasurementName, CanonicalUnit } from '@weather/domain';

interface StoredMeasurement {
  name: string;
  value: number | null;
  unit: string;
  timestamp: string;
}

export class DrizzleObservationRepository implements ObservationRepository {
  constructor(private readonly db: Database) {}

  async findLatestByStation(targetStationId: StationId): Promise<Observation | null> {
    const rows = await this.db
      .select()
      .from(observations)
      .where(eq(observations.stationId, String(targetStationId)))
      .orderBy(desc(observations.timestamp))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findByStationAndTimeRange(
    targetStationId: StationId,
    from: Date,
    to: Date,
  ): Promise<Observation[]> {
    const rows = await this.db
      .select()
      .from(observations)
      .where(
        and(
          eq(observations.stationId, String(targetStationId)),
          gte(observations.timestamp, from),
          lte(observations.timestamp, to),
        ),
      );
    return rows.map((r) => this.toDomain(r));
  }

  async save(observation: Observation): Promise<void> {
    await this.db
      .insert(observations)
      .values(this.toRow(observation))
      .onConflictDoNothing();
  }

  async saveMany(observationList: Observation[]): Promise<void> {
    if (observationList.length === 0) return;

    const rows = observationList.map((o) => this.toRow(o));
    await this.db.insert(observations).values(rows).onConflictDoNothing();
  }

  private toDomain(row: typeof observations.$inferSelect): Observation {
    const storedMeasurements = row.measurements as Record<string, StoredMeasurement>;
    const measurementMap = new Map<string, Measurement>();

    for (const [key, stored] of Object.entries(storedMeasurements)) {
      measurementMap.set(key, {
        name: stored.name as MeasurementName,
        value: stored.value,
        unit: stored.unit as CanonicalUnit,
        timestamp: new Date(stored.timestamp),
      });
    }

    return {
      id: observationId(row.id),
      stationId: stationId(row.stationId),
      sensorId: sensorId(row.sensorId),
      timestamp: row.timestamp,
      receivedAt: row.receivedAt,
      source: row.source as ObservationSource,
      measurements: measurementMap,
      rawPayloadHash: row.rawPayloadHash,
    };
  }

  private toRow(observation: Observation) {
    const measurements: Record<string, StoredMeasurement> = {};
    for (const [key, m] of observation.measurements) {
      measurements[key] = {
        name: m.name,
        value: m.value,
        unit: m.unit,
        timestamp: m.timestamp.toISOString(),
      };
    }

    return {
      id: String(observation.id),
      stationId: String(observation.stationId),
      sensorId: String(observation.sensorId),
      timestamp: observation.timestamp,
      receivedAt: observation.receivedAt,
      source: observation.source,
      measurements,
      rawPayloadHash: observation.rawPayloadHash,
    };
  }
}
