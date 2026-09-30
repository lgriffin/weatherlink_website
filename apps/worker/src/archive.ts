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
 *
 *   pnpm archive:gaps [--from YYYY-MM-DD] [--min-hours 2] [--json] [--save]
 *     List outages: spans with no usable outdoor reading, either because
 *     nothing was logged or because the ISS reported nothing. --save also
 *     stores the list for the Outputs page.
 *
 * Harvest and rebuild record how they went on the Outputs page too.
 *
 *   pnpm --filter @weather/worker archive current
 *     Fetch current conditions once (used before publishing a snapshot).
 */
import { hostname } from 'node:os';
import { parseArgs } from 'node:util';
import type { DataGap } from '@weather/domain';
import { composeWorker } from './compose.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string' },
    force: { type: 'boolean', default: false },
    'min-hours': { type: 'string', default: '2' },
    json: { type: 'boolean', default: false },
    save: { type: 'boolean', default: false },
  },
});

const command = positionals[0];
if (command !== 'harvest' && command !== 'rebuild' && command !== 'gaps' && command !== 'current') {
  console.error(
    'Usage: archive <harvest [--from YYYY-MM-DD] [--force] | rebuild | gaps [--from YYYY-MM-DD] [--min-hours N] [--json] [--save] | current>',
  );
  process.exit(1);
}

function parseFrom(): Date | undefined {
  if (!values.from) return undefined;
  const from = new Date(`${values.from}T00:00:00Z`);
  if (Number.isNaN(from.getTime())) throw new Error(`Invalid --from date: ${values.from}`);
  return from;
}

function formatGap(gap: DataGap, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-IE', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
  const hours = (gap.to.getTime() - gap.from.getTime()) / 3_600_000;
  const length = hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} hours`;
  const cause = gap.kind === 'sensor-fault'
    ? `ISS reported nothing (${gap.recordsWithoutData} archive records without outdoor data)`
    : 'nothing logged';
  return `- ${fmt.format(gap.from)} to ${fmt.format(gap.to)}: ${length}, ${cause}`;
}

const worker = await composeWorker(`archive-${command}`);
const { logger, client } = worker;
const source = worker.env.INGEST_SOURCE ?? hostname();
const startedAt = new Date();

/** Best effort: a missing table (migrations not run yet) must not fail the command itself. */
async function report(kind: 'harvest' | 'outages', payload: unknown): Promise<void> {
  try {
    await worker.recordIngestReport.execute(kind, source, payload);
  } catch (error) {
    logger.warn({ err: error }, `Could not record the ${kind} report for the Outputs page`);
  }
}

function runReport(status: 'ok' | 'failed', details: Record<string, unknown>) {
  return { status, task: command, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), ...details };
}

try {
  if (command === 'harvest') {
    await worker.discoverStations.execute();
    const from = parseFrom();
    const result = await worker.harvestFullArchive.execute({
      ...(from ? { from } : {}),
      force: values.force,
    });
    logger.info(result, 'Harvest finished. Run "pnpm archive:rebuild" to refresh summaries and records.');
    await report('harvest', runReport('ok', { details: result }));
  } else if (command === 'current') {
    await worker.discoverStations.execute();
    const observations = await worker.pollCurrentConditions.execute();
    logger.info({ observations: observations.length }, 'Current conditions saved');
  } else if (command === 'rebuild') {
    const result = await worker.rebuildFromArchive.execute();
    logger.info(result, 'Rebuild finished');
    await report('harvest', runReport('ok', { details: result }));
  } else {
    const minHours = Number(values['min-hours']);
    if (!Number.isFinite(minHours) || minHours <= 0) throw new Error('--min-hours must be a positive number');
    const from = parseFrom();
    const gaps = await worker.findDataGaps.execute({
      ...(from ? { from } : {}),
      minGapMs: minHours * 3_600_000,
    });
    const list = gaps.map((g) => ({ ...g, stationId: String(g.stationId), from: g.from.toISOString(), to: g.to.toISOString() }));
    if (values.save) {
      await report('outages', list);
      logger.info({ outages: list.length }, 'Outage list saved for the Outputs page');
    }
    if (values.json) {
      console.log(JSON.stringify(list, null, 2));
    } else if (gaps.length === 0) {
      console.log(`No outages longer than ${minHours} hours.`);
    } else {
      console.log(`${gaps.length} outages longer than ${minHours} hours:`);
      for (const gap of gaps) console.log(formatGap(gap, worker.env.APP_TIMEZONE));
    }
  }
} catch (error) {
  logger.error({ err: error }, `Archive ${command} failed`);
  process.exitCode = 1;
  if (command === 'harvest' || command === 'rebuild') {
    await report('harvest', runReport('failed', { message: error instanceof Error ? error.message : String(error) }));
  }
} finally {
  client.close();
}
