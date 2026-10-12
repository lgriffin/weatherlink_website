import { describe, it, expect } from 'vitest';
import { MetEireannWarnings, parseWarning } from './warnings.js';

const FEED = [
  {
    id: '1', type: 'Wind', severity: 'Moderate', level: 'Yellow', headline: 'Wind warning for Galway, Mayo',
    description: 'Southwest winds gusting 90 km/h.', onset: '2026-10-12T18:00:00+01:00',
    expiry: '2026-10-13T06:00:00+01:00', regions: ['EI07', 'EI15'],
  },
  { id: '2', type: 'Rain', level: 'Orange', headline: 'Old', expiry: '2026-10-11T00:00:00Z', regions: [] },
];

function fakeFetch(body: unknown, status = 200) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    return { ok: status < 400, status, json: async () => body };
  };
  return { fetch, calls };
}

describe('MetEireannWarnings', () => {
  const now = () => Date.parse('2026-10-12T15:00:00Z');

  it('reads the warnings in force or coming up and drops expired ones', async () => {
    const { fetch } = fakeFetch(FEED);
    const warnings = await new MetEireannWarnings({ fetch, now }).current();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ level: 'yellow', type: 'Wind', regions: ['EI07', 'EI15'] });
    expect(warnings[0]!.onset?.toISOString()).toBe('2026-10-12T17:00:00.000Z');
  });

  it('keeps an answer for a while', async () => {
    const { fetch, calls } = fakeFetch([]);
    let t = now();
    const source = new MetEireannWarnings({ fetch, now: () => t, cacheMs: 60_000 });
    await source.current();
    await source.current();
    t += 61_000;
    await source.current();
    expect(calls).toHaveLength(2);
  });

  it('drops a kept warning once it expires', async () => {
    const { fetch } = fakeFetch(FEED);
    let t = now();
    const source = new MetEireannWarnings({ fetch, now: () => t, cacheMs: 24 * 3_600_000 });
    expect(await source.current()).toHaveLength(1);
    t = Date.parse('2026-10-13T05:01:00Z');
    expect(await source.current()).toHaveLength(0);
  });

  it('shares one request between visitors arriving together', async () => {
    let release: () => void = () => {};
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      await new Promise<void>((r) => { release = r; });
      return { ok: true, status: 200, json: async () => FEED };
    };
    const source = new MetEireannWarnings({ fetch, now });
    const both = Promise.all([source.current(), source.current()]);
    await Promise.resolve();
    release();
    const [a, b] = await both;
    expect(calls).toBe(1);
    expect(a).toEqual(b);
  });

  it('does not ask again for a while after a failure', async () => {
    const { fetch, calls } = fakeFetch(null, 503);
    let t = now();
    const source = new MetEireannWarnings({ fetch, now: () => t, retryMs: 60_000 });
    await expect(source.current()).rejects.toThrow('503');
    await expect(source.current()).rejects.toThrow('a moment ago');
    t += 61_000;
    await expect(source.current()).rejects.toThrow('503');
    expect(calls).toHaveLength(2);
  });

  it('treats a feed that is not a list as unreachable, not as no warnings', async () => {
    const { fetch } = fakeFetch({ error: 'maintenance' });
    await expect(new MetEireannWarnings({ fetch, now }).current()).rejects.toThrow('not a list');
  });

  it('says when Met Éireann is down', async () => {
    const { fetch } = fakeFetch(null, 503);
    await expect(new MetEireannWarnings({ fetch, now }).current()).rejects.toThrow('503');
  });

  it('copes with missing fields', () => {
    expect(parseWarning({ level: 'purple' })).toEqual({
      level: 'unknown', type: '', headline: '', description: '', onset: null, expiry: null, regions: [],
    });
  });
});
