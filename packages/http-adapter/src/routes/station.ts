import type { FastifyInstance } from 'fastify';
import type { StationRepository } from '@weather/domain';

export interface StationRouteDeps {
  stationRepo: StationRepository;
}

export function registerStationRoutes(app: FastifyInstance, deps: StationRouteDeps): void {
  app.get('/api/v1/station', async (_request, reply) => {
    const stations = await deps.stationRepo.findAll();
    const active = stations.find((s) => s.isActive);

    return reply.send({
      stations: stations.map((s) => ({
        id: String(s.id),
        name: s.name,
        timezone: s.timezone,
        latitude: s.latitude,
        longitude: s.longitude,
        elevationMetres: s.elevationMetres,
        isActive: s.isActive,
      })),
      activeStationId: active ? String(active.id) : null,
    });
  });
}
