import { z } from 'zod';

/**
 * Outputs pushed to POST /api/v1/ingest/:kind from other machines. Each
 * schema requires only the fields the Outputs page shows and lets the rest
 * through, so newer model versions can add fields without breaking uploads.
 */

const Prob = z.number().min(0).max(1);

/** `python -m wxml predict --json [--ask MODEL]` */
export const ForecastPayloadSchema = z.object({
  station: z.string().optional(),
  evening: z.object({
    date: z.string(),
    night_min: z.number(),
    night_min_range: z.tuple([z.number(), z.number()]),
    frost_chance: Prob,
    day_max: z.number().nullable().optional(),
    rain_next_24h_chance: Prob.nullable().optional(),
    analogs: z.array(z.object({ date: z.string(), night_min: z.number() }).passthrough()).optional(),
  }).passthrough(),
  latest_hour: z.object({
    time: z.string(),
    rain_next_6h_chance: Prob.optional(),
    temp_in_24h: z.number().optional(),
  }).passthrough().optional(),
  brief: z.string(),
  /** The language model's wording, when --ask was used. */
  forecast: z.string().optional(),
}).passthrough();

const Score = z.object({
  model: z.number(),
  climatology: z.number().optional(),
  persistence: z.number().optional(),
}).passthrough();

const TaskScore = z.union([
  z.object({ skipped: z.string() }),
  z.object({
    description: z.string().optional(),
    test_rows: z.number().optional(),
    test_from: z.string().optional(),
    test_to: z.string().optional(),
    mae: Score.optional(),
    brier: Score.optional(),
    skill: z.record(z.number().nullable()).optional(),
  }).passthrough(),
]);

/** `ml/out/metrics.json`, written by `pnpm ml:train`. */
export const ModelScoresPayloadSchema = z.object({
  tasks: z.record(TaskScore),
}).passthrough();

/** `pnpm archive:gaps --json` */
export const OutagesPayloadSchema = z.array(z.object({
  stationId: z.string().optional(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(['no-data', 'sensor-fault']),
  recordsWithoutData: z.number().optional(),
  /** Which reading was missing; outdoor temperature when absent. */
  measurement: z.string().optional(),
}).passthrough());

/** A harvest, rebuild or training run finishing on the NAS or the Spark. */
export const HarvestPayloadSchema = z.object({
  status: z.enum(['ok', 'failed']),
  task: z.string().default('harvest'),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  message: z.string().optional(),
  details: z.record(z.unknown()).optional(),
}).passthrough();

export const IngestKindSchema = z.enum(['forecast', 'model-scores', 'outages', 'harvest']);

export const INGEST_PAYLOAD_SCHEMAS = {
  forecast: ForecastPayloadSchema,
  'model-scores': ModelScoresPayloadSchema,
  outages: OutagesPayloadSchema,
  harvest: HarvestPayloadSchema,
} as const;

const ReportMeta = {
  id: z.number(),
  source: z.string(),
  receivedAt: z.string(),
};

export const IngestOverviewResponseSchema = z.object({
  /** False when the server has no INGEST_TOKEN, so uploads are refused. */
  uploadsEnabled: z.boolean(),
  latest: z.object({
    forecast: z.object({ ...ReportMeta, kind: z.literal('forecast'), payload: ForecastPayloadSchema }).nullable(),
    'model-scores': z.object({ ...ReportMeta, kind: z.literal('model-scores'), payload: ModelScoresPayloadSchema }).nullable(),
    outages: z.object({ ...ReportMeta, kind: z.literal('outages'), payload: OutagesPayloadSchema }).nullable(),
    harvest: z.object({ ...ReportMeta, kind: z.literal('harvest'), payload: HarvestPayloadSchema }).nullable(),
  }),
  recent: z.array(z.object({ ...ReportMeta, kind: IngestKindSchema })),
});

export type IngestKindValue = z.infer<typeof IngestKindSchema>;
export type ForecastPayload = z.infer<typeof ForecastPayloadSchema>;
export type ModelScoresPayload = z.infer<typeof ModelScoresPayloadSchema>;
export type OutagesPayload = z.infer<typeof OutagesPayloadSchema>;
export type HarvestPayload = z.infer<typeof HarvestPayloadSchema>;
export type IngestOverviewResponse = z.infer<typeof IngestOverviewResponseSchema>;
