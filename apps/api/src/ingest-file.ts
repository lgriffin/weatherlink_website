/**
 * Load output files into the local database as if they had been uploaded,
 * for runs with no server to post to (the GitHub Pages build).
 *
 *   pnpm --filter @weather/api ingest-file <kind> <file.json> [<kind> <file.json> ...]
 *
 * Each file goes through the same route and validation as an upload. The
 * source shown on the Outputs page is INGEST_SOURCE (default: github-actions).
 */
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { EnvSchema } from '@weather/contracts';
import { buildApp } from './app.js';

const pairs = process.argv.slice(2);
if (pairs.length === 0 || pairs.length % 2 !== 0) {
  console.error('usage: ingest-file <kind> <file.json> [<kind> <file.json> ...]');
  process.exit(2);
}

// A one-off token, so this works whether or not the server has uploads turned on.
const token = randomBytes(24).toString('hex');
process.env['INGEST_TOKEN'] = token;
process.env['WEATHERLINK_API_KEY'] ||= 'not-used';
process.env['WEATHERLINK_API_SECRET'] ||= 'not-used';
process.env['LOG_LEVEL'] ||= 'warn';
const { app, client } = await buildApp(EnvSchema.parse(process.env));

let failed = false;
try {
  for (let i = 0; i < pairs.length; i += 2) {
    const [kind, file] = [pairs[i]!, pairs[i + 1]!];
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/ingest/${kind}`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-source': process.env['INGEST_SOURCE'] || 'github-actions',
        'content-type': 'application/json',
      },
      payload: await readFile(file, 'utf8'),
    });
    if (res.statusCode >= 300) {
      failed = true;
      console.error(`${kind} from ${file}: ${res.statusCode} ${res.body.slice(0, 300)}`);
    } else {
      console.log(`Loaded ${kind} from ${file}`);
    }
  }
} finally {
  await app.close();
  client.close();
}
if (failed) process.exit(1);
