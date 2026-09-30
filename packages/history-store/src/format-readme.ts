/** Written next to the data so the folder explains itself wherever it ends up. */
export const FORMAT_README = `# Weather station history

Everything the station has recorded, as plain files. The weather site
(https://github.com/lgriffin/weatherlink_website) writes and reads this
folder; nothing here depends on that code to be understood.

## Layout

    format.json                                    format name and version
    stations/<id>/station.json                     station and its sensors (no coordinates)
    stations/<id>/sync-windows.json                time ranges already downloaded from WeatherLink
    stations/<id>/archive/YYYY/MM/YYYY-MM-DD.ndjson.gz
                                                   raw archive for one UTC day
    stations/<id>/daily/YYYY/YYYY-MM.csv           daily summaries for one month (local days)

## Raw archive

Each .ndjson.gz file is gzip-compressed, one JSON object per line:

    {"sensorId": "...", "sensorType": 23, "timestamp": "2024-02-01T10:05:00.000Z",
     "intervalMinutes": 5, "fetchedAt": "...", "payload": { ...WeatherLink v2 record... }}

\`payload\` is the record exactly as the WeatherLink v2 historic API returned it
(Imperial units, WeatherLink field names). This is the source of truth: the
site re-derives every observation, summary and record from it.

Read a day with any tool that handles gzip and JSON lines, for example
\`zcat 2024-02-01.ndjson.gz | jq .payload.wind_speed_avg\` or
\`pandas.read_json(path, lines=True)\`.

## Daily summaries

CSV with one row per day and measurement, in canonical units (Celsius, hPa,
m/s, mm, W/m², degrees, percent):

    date,measurement,unit,min,max,avg,count

Daily totals (rain.daily, wind.run, ET) keep the total in \`max\`. An empty
cell means no data, never zero. \`count\` is the number of readings behind
the row; days hit by an outage have fewer.

## Moving it somewhere else

This folder can live anywhere: a git branch, a NAS share, a synced Google
Drive folder. To load it into a fresh database:

    pnpm archive:import --from <this folder>
    pnpm archive:rebuild
`;
