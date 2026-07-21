import type { StationRepository, StationId } from '@weather/domain';
import type { Logger } from '@weather/observability';

export class SelectStation {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly logger: Logger,
  ) {}

  async execute(targetStationId: StationId): Promise<void> {
    const allStations = await this.stationRepo.findAll();

    for (const station of allStations) {
      if (station.isActive && station.id !== targetStationId) {
        await this.stationRepo.save({ ...station, isActive: false, updatedAt: new Date() });
      }
    }

    const target = await this.stationRepo.findById(targetStationId);
    if (!target) {
      throw new Error(`Station ${String(targetStationId)} not found`);
    }

    if (!target.isActive) {
      await this.stationRepo.save({ ...target, isActive: true, updatedAt: new Date() });
    }

    this.logger.info({ stationId: String(targetStationId) }, 'Station selected');
  }
}
