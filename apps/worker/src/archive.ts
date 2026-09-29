/**
 * Archive maintenance commands.
 *
 *   pnpm archive:harvest [--from YYYY-MM-DD] [--force]
 *     Download the station's archive day by day from its registration date
 *     (or --from) and keep every raw record. Resumable; --force re-downloads
 *     days already synced and replaces their observations.
 *
 *   pnpm archive:rebuild
 *     Re-derive historic observations, daily summaries and records from the
 *     stored raw archive. Downloads nothing.
 */
import { parseArgs } from 'node:util';
import { composeWorker } from './compose.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});

const command = positionals[0];
if (command !== 'harvest' && command !== 'rebuild') {
  console.error('Usage: archive <harvest [--from YYYY-MM-DD] [--force] | rebuild>');
  process.exit(1);
}

const worker = await composeWorker(`archive-${command}`);
const { logger, client } = worker;

try {
  if (command === 'harvest') {
    await worker.discoverStations.execute();
    const from = values.from ? new Date(`${values.from}T00:00:00Z`) : undefined;
    if (from && Number.isNaN(from.getTime())) {
      throw new Error(`Invalid --from date: ${values.from}`);
    }
    const result = await worker.harvestFullArchive.execute({
      ...(from ? { from } : {}),
      force: values.force,
    });
    logger.info(result, 'Harvest finished. Run "pnpm archive:rebuild" to refresh summaries and records.');
  } else {
    const result = await worker.rebuildFromArchive.execute();
    logger.info(result, 'Rebuild finished');
  }
} catch (error) {
  logger.error({ err: error }, `Archive ${command} failed`);
  process.exitCode = 1;
} finally {
  client.close();
}
