import { describe, it, expect, beforeEach } from 'vitest';
import { CleanupOldData } from './cleanup-old-data.js';
import {
  FakeClock,
  InMemoryObservationRepository,
  InMemoryDailySummaryRepository,
  anObservation,
  aDailySummary,
} from '@weather/test-support';
import { createLogger } from '@weather/observability';
import { observationId } from '@weather/domain';

const logger = createLogger({ level: 'silent', name: 'test' });
const MS_PER_DAY = 86400000;

describe('CleanupOldData', () => {
  let observationRepo: InMemoryObservationRepository;
  let dailySummaryRepo: InMemoryDailySummaryRepository;
  let clock: FakeClock;
  let useCase: CleanupOldData;

  beforeEach(() => {
    observationRepo = new InMemoryObservationRepository();
    dailySummaryRepo = new InMemoryDailySummaryRepository();
    clock = new FakeClock(new Date('2027-07-17T14:00:00Z'));
    useCase = new CleanupOldData(
      observationRepo,
      dailySummaryRepo,
      { observationMaxAgeDays: 365, summaryMaxAgeDays: 3650 },
      clock,
      logger,
    );
  });

  it('deletes observations older than retention period', async () => {
    const oldObs = anObservation({
      id: observationId('old-obs'),
      timestamp: new Date('2026-01-01T00:00:00Z'),
    });
    const recentObs = anObservation({
      id: observationId('recent-obs'),
      timestamp: new Date('2027-07-16T00:00:00Z'),
    });
    await observationRepo.save(oldObs);
    await observationRepo.save(recentObs);

    await useCase.execute();

    const remaining = observationRepo.getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('recent-obs');
  });

  it('deletes summaries older than retention period', async () => {
    const oldSummary = aDailySummary({ date: '2015-01-01' });
    const recentSummary = aDailySummary({ date: '2027-07-16' });
    await dailySummaryRepo.save(oldSummary);
    await dailySummaryRepo.save(recentSummary);

    await useCase.execute();

    const remaining = dailySummaryRepo.getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.date).toBe('2027-07-16');
  });

  it('does nothing when no old data exists', async () => {
    const recentObs = anObservation({
      timestamp: new Date('2027-07-16T00:00:00Z'),
    });
    await observationRepo.save(recentObs);

    await useCase.execute();

    expect(observationRepo.getAll()).toHaveLength(1);
  });

  it('respects custom retention policy', async () => {
    const customUseCase = new CleanupOldData(
      observationRepo,
      dailySummaryRepo,
      { observationMaxAgeDays: 30, summaryMaxAgeDays: 90 },
      clock,
      logger,
    );

    const obs = anObservation({
      timestamp: new Date('2027-06-01T00:00:00Z'),
    });
    await observationRepo.save(obs);

    await customUseCase.execute();

    expect(observationRepo.getAll()).toHaveLength(0);
  });
});
