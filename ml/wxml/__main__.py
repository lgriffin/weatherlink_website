"""Command line: python -m wxml <command> (run from the ml/ folder).

  export       write the hourly and evening tables for your own analysis
  train        train the models, score them against the baselines, save them
  predict      run the saved models on the latest data and print tonight's brief
  llm-dataset  build the fine-tuning set for the Ollama forecaster
  modelfile    write an Ollama Modelfile for your fine-tuned adapter
  guidance     what the big weather models say for the station (Open-Meteo)
  guidance-check  how well each of those models has done at the station
  guidance-sync   save their past forecasts, as issued, for training (MOS)
  neighbours-sync save Met Éireann station and Atlantic buoy readings, for training
  scores       the last training run's scores as a Markdown table
  issue        make tonight's forecast, keep it in the ledger and send it to the site
  verify       score the ledger's forecasts against what happened
  due          exit 0 when tonight's forecast can be made and hasn't been yet
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = ML_DIR.parent


def setting(name: str) -> str | None:
    """An environment variable, or its line in the repo's .env."""
    value = os.environ.get(name)
    if not value:
        env_file = REPO_DIR / '.env'
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.strip().startswith(f'{name}='):
                    value = line.split('=', 1)[1].strip().strip('"\'')
    return value or None


def default_db() -> Path:
    path = Path(setting('DATABASE_PATH') or './data/weather.db')
    return path if path.is_absolute() else (REPO_DIR / path).resolve()


def load_tables(args, with_guidance: bool = False):
    from .data import load_hourly
    from .features import build_features, evening_table, hourly_targets
    print(f'Reading {args.db} (read-only)...', file=sys.stderr)
    station, hourly = load_hourly(args.db, args.station)
    if hourly.empty:
        raise SystemExit('No archive observations found. Run `pnpm archive:harvest` and `pnpm archive:rebuild` first.')
    features = build_features(hourly, station)
    evenings = evening_table(hourly, features, station)
    rows = hourly_targets(hourly, features)
    outage_hours = int(hourly['outage'].sum())
    print(f'{station.name}: {hourly.index.min():%Y-%m-%d} to {hourly.index.max():%Y-%m-%d}, '
          f'{len(hourly):,} hours ({outage_hours:,} without data), {len(evenings):,} evenings', file=sys.stderr)
    if with_guidance:
        evenings, rows = _join_guidance(args, station, evenings, rows)
        evenings, rows = _join_neighbours(args, hourly, evenings, rows)
    return station, hourly, evenings, rows


NEIGHBOUR_SOURCES = ('iwbn', 'met-eireann')


def _neighbour_sources():
    from .adapters.irish_buoys import IrishBuoys
    from .adapters.met_eireann import MetEireannObservations
    return [IrishBuoys(), MetEireannObservations()]


def _archived_neighbours(args):
    """The saved neighbour readings around a past evening, or None."""
    import pandas as pd

    from .adapters.neighbour_files import NeighbourFiles
    if not args.date:
        return None
    day = pd.Timestamp(args.date)
    files = NeighbourFiles(args.neighbours_dir)
    frames = [f for f in (files.load(name, f'{day - pd.Timedelta(days=1):%Y-%m-%d}', f'{day:%Y-%m-%d}')
                          for name in NEIGHBOUR_SOURCES) if len(f)]
    return pd.concat(frames, ignore_index=True) if frames else None


def _join_neighbours(args, hourly, evenings, rows):
    import pandas as pd

    from .adapters.neighbour_files import NeighbourFiles
    from .forecasting.neighbours import add_neighbours
    files = NeighbourFiles(args.neighbours_dir)
    frames = [f for f in (files.load(name) for name in NEIGHBOUR_SOURCES) if len(f)]
    if not frames:
        print(f'No saved neighbour readings in {args.neighbours_dir}; run `neighbours-sync` to add them.',
              file=sys.stderr)
        return evenings, rows
    neighbours = pd.concat(frames, ignore_index=True)
    print(f"Neighbours: {neighbours['site'].nunique()} sites, {neighbours['hour'].min():%Y-%m-%d} to "
          f"{neighbours['hour'].max():%Y-%m-%d}", file=sys.stderr)
    return add_neighbours(evenings, rows, neighbours, hourly)


def _archived_guidance(args):
    from .adapters.guidance_files import GuidanceFiles
    from .adapters.open_meteo import OpenMeteoForecastSource
    return GuidanceFiles(args.guidance_dir).load(OpenMeteoForecastSource.name, 1)


def _join_guidance(args, station, evenings, rows):
    from .forecasting.mos import add_guidance
    guidance = _archived_guidance(args)
    if guidance.empty:
        print(f'No saved guidance in {args.guidance_dir}; training on the station alone. '
              'Run `guidance-sync` first to add it.', file=sys.stderr)
        return evenings, rows
    print(f"Guidance: {guidance['model'].nunique()} models, {guidance['hour'].min():%Y-%m-%d} to "
          f"{guidance['hour'].max():%Y-%m-%d} (as issued a day ahead)", file=sys.stderr)
    return add_guidance(evenings, rows, guidance, station.timezone)


def cmd_export(args):
    station, hourly, evenings, _ = load_tables(args)
    out = args.out / 'tables'
    out.mkdir(parents=True, exist_ok=True)
    local = hourly.copy()
    local.insert(0, 'local_time', hourly.index.tz_convert(station.timezone).strftime('%Y-%m-%d %H:%M'))
    local.to_csv(out / 'hourly.csv', index_label='utc_hour')
    evenings.drop(columns=['issue_hour']).to_csv(out / 'evenings.csv', index_label='date')
    print(f'Wrote {out / "hourly.csv"} and {out / "evenings.csv"}')


def cmd_train(args):
    from .models import train_all
    _, _, evenings, rows = load_tables(args, with_guidance=not args.no_guidance)
    train_all({'evening': evenings, 'hourly': rows}, args.out, test_from=args.test_from)
    print(f'Models in {args.out / "models"}, scores in {args.out / "metrics.json"}')


def _warn(what, err):
    print(f'No {what} ({err}); carrying on without.', file=sys.stderr)


def outside_inputs(args) -> dict:
    """What tonight's forecast can use from outside the station: guidance from the weather
    models (the latest runs for today, the saved ones for a past date), the neighbours'
    recent readings, and Met Éireann's own forecast as a second opinion."""
    import pandas as pd
    out = {'guidance': None, 'neighbours': None, 'second_opinions': []}
    if args.guidance == 'none':
        return out
    live = args.guidance == 'live' and not args.date
    try:
        if live:
            from .adapters.open_meteo import DEFAULT_MODELS, OpenMeteoForecastSource
            frame = OpenMeteoForecastSource().latest(_location(args), DEFAULT_MODELS, hours=48, past_hours=24)
        else:
            frame = _archived_guidance(args)
        out['guidance'] = frame if not frame.empty else None
    except (RuntimeError, LookupError, OSError) as err:
        _warn('weather-model guidance', err)
    if not live:
        out['neighbours'] = _archived_neighbours(args)
        return out
    frames = []
    for source in _neighbour_sources():
        try:
            frames.append(source.recent(hours=24))
        except (RuntimeError, OSError, ValueError) as err:
            _warn(f'{source.name} readings', err)
    frames = [f for f in frames if len(f)]
    out['neighbours'] = pd.concat(frames, ignore_index=True) if frames else None
    try:
        from .adapters.met_eireann import MetEireannForecastSource
        frame = MetEireannForecastSource().latest(_location(args), hours=48, past_hours=24)
        if not frame.empty:
            out['second_opinions'].append(frame)
    except (RuntimeError, LookupError, OSError, ValueError) as err:
        _warn("Met Éireann's forecast", err)
    return out


def cmd_predict(args):
    from .predict import forecast
    result = forecast(args.db, args.out / 'models', args.station, args.date, **outside_inputs(args))
    if args.ask:
        from .adapters.ollama_narrator import OllamaNarrator
        result['forecast'] = OllamaNarrator(args.ask).write(result['brief'])
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(result['brief'])
        if 'forecast' in result:
            print('\n' + result['forecast'])


def cmd_llm_dataset(args):
    from . import llm_dataset
    _, _, evenings, rows = load_tables(args)
    split = llm_dataset.build(evenings, rows, rewrite_with=args.rewrite_with)
    out = args.out / 'llm'
    llm_dataset.write(split, out)
    print(f"Wrote {len(split['train'])} training and {len(split['valid'])} validation examples to {out}")
    print(f'Read a sample in {out / "review.csv"} before training.')


def cmd_modelfile(args):
    text = modelfile(args.base, args.adapter)
    args.output = args.output or args.out / 'Modelfile'
    args.output.write_text(text)
    print(f'Wrote {args.output}. Next: ollama create station-forecaster -f {args.output}')


def _location(args):
    from .forecasting.domain import Location
    if (args.lat is None) != (args.lon is None):
        raise SystemExit('Pass both --lat and --lon, or neither to use the station.')
    if args.lat is not None:
        return Location(args.lat, args.lon, args.elevation)
    from contextlib import closing

    from .data import connect_readonly, load_station
    from .forecasting.guidance import location_of
    with closing(connect_readonly(args.db)) as conn:
        return location_of(load_station(conn, args.station))


def cmd_guidance(args):
    from .adapters.open_meteo import OpenMeteoForecastSource
    frame = OpenMeteoForecastSource().latest(_location(args), args.models, args.hours)
    if args.json:
        out = frame.assign(hour=frame['hour'].dt.strftime('%Y-%m-%dT%H:%MZ'))
        print(out.to_json(orient='records', indent=1))
        return
    if frame.empty:
        raise SystemExit('Open-Meteo returned no data for those models.')
    cols = ['temp', 'rain', 'wind', 'gust', 'cloud', 'pressure']
    for model, g in frame.groupby('model', sort=False):
        print(f'\n{model}')
        table = g.set_index('hour')[cols].iloc[::args.every]
        print(table.round(1).to_string())
    print('\nWeather data by Open-Meteo.com (CC BY 4.0)')


def cmd_guidance_check(args):
    from .adapters.open_meteo import OpenMeteoForecastSource
    from .adapters.sqlite_store import SqliteObservationStore
    from .forecasting.guidance import check_guidance
    location = _location(args) if args.lat is not None or args.lon is not None else None
    station, scores = check_guidance(SqliteObservationStore(args.db), OpenMeteoForecastSource(), args.models,
                                     days=args.days, lead_days=args.lead, station_id=args.station,
                                     location=location)
    path = args.out / 'guidance-scores.json'
    path.write_text(scores.to_json(orient='records', indent=1))
    if scores.empty:
        raise SystemExit('Nothing to compare: no overlap between the guidance and the station.')
    print(f'{station.name}: forecasts made {args.lead} day(s) ahead, last {args.days} days')
    print('bias = model minus station; skill > 0 beats persistence (same time yesterday)\n')
    for var, g in scores.groupby('variable', sort=False):
        print(g.drop(columns=['variable', 'lead_days']).round(3).to_string(index=False), '\n', sep='')
    print(f'Saved {path}. Weather data by Open-Meteo.com (CC BY 4.0)')


def cmd_guidance_sync(args):
    from .adapters.guidance_files import GuidanceFiles
    from .adapters.open_meteo import OpenMeteoForecastSource
    from .forecasting.guidance import sync_guidance
    fetched = sync_guidance(OpenMeteoForecastSource(), GuidanceFiles(args.guidance_dir), _location(args),
                            args.models, lead_days=args.lead, first=args.since,
                            log=lambda line: print(line, file=sys.stderr))
    print(f'Fetched {len(fetched)} month(s) into {args.guidance_dir}. Weather data by Open-Meteo.com (CC BY 4.0)')


def cmd_scores(args):
    from .report import markdown
    path = args.out / 'metrics.json'
    if not path.exists():
        raise SystemExit(f'No {path}; run `train` first.')
    print(markdown(json.loads(path.read_text())), end='')


def _publishers(targets: list[str]):
    from .adapters.publishers import FilePublisher, HttpPublisher
    out = []
    for target in targets:
        if target == 'site':
            url, token = setting('SITE_URL'), setting('INGEST_TOKEN')
            if not url or not token:
                raise SystemExit('Set SITE_URL and INGEST_TOKEN (environment or .env) to publish to the site.')
            import socket
            out.append(HttpPublisher(url, token, setting('INGEST_SOURCE') or socket.gethostname().split('.')[0]))
        else:
            out.append(FilePublisher(target))
    return out


def cmd_issue(args):
    import pandas as pd

    from .adapters.ledger_files import LedgerFiles
    from .forecasting.ledger import issue_forecast
    from .predict import forecast
    publishers = _publishers(args.publish)
    narrator = None
    if args.ask:
        from .adapters.ollama_narrator import OllamaNarrator
        narrator = OllamaNarrator(args.ask)

    from contextlib import closing

    from .data import connect_readonly, load_station
    with closing(connect_readonly(args.db)) as conn:
        station = load_station(conn, args.station)
    now = pd.Timestamp.now(tz='UTC')
    # Tonight's, unless asked for another: never an earlier evening passed off as tonight's.
    date = args.date or f'{now.tz_convert(station.timezone):%Y-%m-%d}'

    used = {}

    def run():
        used.update(outside_inputs(args))
        return forecast(args.db, args.out / 'models', args.station, date, **used)

    record = issue_forecast(run, LedgerFiles(args.ledger), now, narrator=narrator,
                            narrator_name=args.ask, publishers=tuple(publishers), replace=args.replace,
                            date=date, log=lambda line: print(line, file=sys.stderr),
                            on_saved=lambda r: _keep_guidance(
                                args, r, [used.get('guidance'), *used.get('second_opinions', [])]))
    if record is None:
        return
    metrics = args.out / 'metrics.json'
    if args.with_scores and metrics.exists():
        for publisher in publishers:
            publisher.publish('model-scores', json.loads(metrics.read_text()))
    print(json.dumps(record, indent=2, ensure_ascii=False) if args.json else record['brief'])
    if record.get('forecast') and not args.json:
        print('\n' + record['forecast'])


def cmd_due(args):
    import pandas as pd

    from .adapters.ledger_files import LedgerFiles
    from .data import load_hourly
    station, hourly = load_hourly(args.db, args.station)
    today = args.today or f'{pd.Timestamp.now(tz=station.timezone):%Y-%m-%d}'
    if LedgerFiles(args.ledger).get(today) is not None:
        raise SystemExit(f'{today} already has a forecast.')
    # The forecast is issued from the 17:00-18:00 local hour.
    issue = pd.Timestamp(today).replace(hour=17).tz_localize(station.timezone).tz_convert('UTC')
    if issue not in hourly.index or bool(hourly.loc[issue, 'outage']):
        raise SystemExit(f"No 17:00-18:00 reading for {today} yet.")
    print(f'{today}: due')


def _keep_guidance(args, record, frames):
    """Keep the live guidance this forecast used, as issued (lead 0), from its 18:00 for a day."""
    import pandas as pd

    from .adapters.guidance_files import GuidanceFiles
    from .forecasting.guidance import keep_issued_guidance
    if args.date or args.guidance != 'live':
        return
    tz = record.get('timezone') or 'Europe/Dublin'
    issued = pd.Timestamp(record['evening']['date']).replace(hour=18).tz_localize(tz)
    archive = GuidanceFiles(args.guidance_dir)
    for frame in frames:
        if frame is not None and len(frame):
            keep_issued_guidance(archive, frame, issued)


def cmd_neighbours_sync(args):
    from .adapters.neighbour_files import NeighbourFiles
    from .forecasting.neighbours import sync_neighbours
    archive = NeighbourFiles(args.neighbours_dir)
    failed = False
    for source in _neighbour_sources():
        try:
            fetched = sync_neighbours(source, archive, args.since, log=lambda line: print(line, file=sys.stderr))
            print(f'{source.name}: fetched {len(fetched)} month(s) into {args.neighbours_dir}')
        except (RuntimeError, OSError, ValueError) as err:
            print(f'{source.name}: {err}', file=sys.stderr)
            failed = True
    print('Readings from Met Éireann (CC BY 4.0) and the Marine Institute (CC BY 4.0)')
    if failed:
        raise SystemExit(1)


def cmd_verify(args):
    import pandas as pd

    from .adapters.ledger_files import LedgerFiles
    from .forecasting.ledger import ledger_scores, verify_ledger
    ledger = LedgerFiles(args.ledger)
    if not ledger.dates():
        print(f'No forecasts in {args.ledger} yet.')
        return
    _, _, evenings, _ = load_tables(args)
    done = verify_ledger(ledger, evenings, pd.Timestamp.now(tz='UTC'))
    scores = ledger_scores(ledger, since=args.since)
    (args.ledger / 'scores.json').write_text(json.dumps(scores, indent=1) + '\n')
    print(f'Verified {len(done)} new evening(s). Scores over {scores["evenings"]} verified evenings:')
    print(json.dumps(scores, indent=1))


def _local(ref: str | None) -> str | None:
    """Local paths become absolute, since Ollama reads them relative to the Modelfile."""
    if ref and Path(ref).exists():
        return str(Path(ref).resolve())
    return ref


def modelfile(base: str, adapter: str | None) -> str:
    from .brief import SYSTEM_PROMPT
    base, adapter = _local(base), _local(adapter)
    lines = [f'FROM {base}']
    if adapter:
        lines.append(f'ADAPTER {adapter}')
    lines += ['', f'SYSTEM """{SYSTEM_PROMPT}"""', '', 'PARAMETER temperature 0.3', 'PARAMETER num_ctx 4096', '']
    return '\n'.join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m wxml', description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--db', type=Path, default=default_db(), help='SQLite database (default: DATABASE_PATH)')
    parser.add_argument('--out', type=Path, default=ML_DIR / 'out', help='output folder (default: ml/out)')
    parser.add_argument('--station', help='station id (default: the active station)')
    parser.add_argument('--guidance-dir', type=Path, help='saved as-issued guidance (default: <out>/guidance)')
    parser.add_argument('--neighbours-dir', type=Path, help="saved neighbours' readings (default: <out>/neighbours)")
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('export', help='write hourly.csv and evenings.csv')
    p.set_defaults(func=cmd_export)

    p = sub.add_parser('train', help='train and score the models')
    p.add_argument('--test-from', help='first date of the held-out test period (default: last 12 months)')
    p.add_argument('--no-guidance', action='store_true', help='train on the station alone, even with saved guidance')
    p.set_defaults(func=cmd_train)

    p = sub.add_parser('predict', help="tonight's numbers and brief")
    p.add_argument('--date', help='evening to forecast from (default: the latest)')
    p.add_argument('--ask', metavar='MODEL', help='also ask this Ollama model for the written forecast')
    p.add_argument('--json', action='store_true', help='print everything as JSON')
    p.add_argument('--guidance', choices=['live', 'archive', 'none'], default='live',
                   help='weather-model guidance: the latest runs (default), the saved ones, or none')
    p.add_argument('--lat', type=float, help=argparse.SUPPRESS)
    p.add_argument('--lon', type=float, help=argparse.SUPPRESS)
    p.add_argument('--elevation', type=float, help=argparse.SUPPRESS)
    p.set_defaults(func=cmd_predict)

    p = sub.add_parser('llm-dataset', help='build train.jsonl / valid.jsonl for fine-tuning')
    p.add_argument('--rewrite-with', metavar='MODEL', help='polish each draft with this local Ollama model')
    p.set_defaults(func=cmd_llm_dataset)

    p = sub.add_parser('modelfile', help='write an Ollama Modelfile')
    p.add_argument('--base', default='llama3.2:3b', help='base model the adapter was trained on')
    p.add_argument('--adapter', help='path to the LoRA adapter folder or GGUF')
    p.add_argument('--output', type=Path, help='where to write it (default: <out>/Modelfile)')
    p.set_defaults(func=cmd_modelfile)

    from .adapters.open_meteo import DEFAULT_MODELS

    def guidance_args(p):
        p.add_argument('--models', type=lambda v: v.split(','), default=DEFAULT_MODELS,
                       help=f"Open-Meteo model ids, comma-separated (default: {','.join(DEFAULT_MODELS)})")
        p.add_argument('--lat', type=float, help="latitude (default: the station's, from the database)")
        p.add_argument('--lon', type=float, help='longitude')
        p.add_argument('--elevation', type=float, help='metres above sea level (with --lat/--lon)')

    p = sub.add_parser('guidance', help='the next hours from the big weather models')
    guidance_args(p)
    p.add_argument('--hours', type=int, default=48, help='how far ahead (default: 48)')
    p.add_argument('--every', type=int, default=3, help='print every Nth hour (default: 3)')
    p.add_argument('--json', action='store_true', help='print every hour as JSON')
    p.set_defaults(func=cmd_guidance)

    p = sub.add_parser('guidance-check', help="score the models' past forecasts against the station")
    guidance_args(p)
    p.add_argument('--days', type=int, default=60, help='how many recent days to score (default: 60)')
    p.add_argument('--lead', type=int, default=1, help='forecasts made this many days ahead, 1 to 7 (default: 1)')
    p.set_defaults(func=cmd_guidance_check)

    from .forecasting.guidance import GUIDANCE_FROM
    p = sub.add_parser('guidance-sync', help="save the models' past forecasts, as issued, for training")
    guidance_args(p)
    p.add_argument('--lead', type=int, default=1, help='forecasts made this many days ahead, 1 to 7 (default: 1)')
    p.add_argument('--since', default=GUIDANCE_FROM, help=f'first date to fetch (default: {GUIDANCE_FROM})')
    p.set_defaults(func=cmd_guidance_sync)

    p = sub.add_parser('neighbours-sync', help='save Met Éireann station and Atlantic buoy readings for training')
    p.add_argument('--since', default='2023-01-01', help='first date to fetch (default: 2023-01-01)')
    p.set_defaults(func=cmd_neighbours_sync)

    p = sub.add_parser('scores', help="the last training run's scores as a Markdown table")
    p.set_defaults(func=cmd_scores)

    def ledger_arg(p):
        p.add_argument('--ledger', type=Path, help='where issued forecasts are kept (default: <out>/ledger)')

    p = sub.add_parser('issue', help="make tonight's forecast, keep it and send it to the site")
    ledger_arg(p)
    p.add_argument('--date', help='evening to forecast from (default: the latest)')
    p.add_argument('--ask', metavar='MODEL', help='an Ollama model to write the words')
    p.add_argument('--publish', action='append', default=[], metavar='site|DIR',
                   help="'site' posts to SITE_URL with INGEST_TOKEN; a folder gets <kind>.json files (repeatable)")
    p.add_argument('--with-scores', action='store_true', help="also publish the last training run's scores")
    p.add_argument('--replace', action='store_true', help='replace a forecast already kept for that evening')
    p.add_argument('--json', action='store_true', help='print the whole record')
    p.add_argument('--guidance', choices=['live', 'archive', 'none'], default='live',
                   help='weather-model guidance: the latest runs (default), the saved ones, or none')
    p.add_argument('--lat', type=float, help=argparse.SUPPRESS)
    p.add_argument('--lon', type=float, help=argparse.SUPPRESS)
    p.add_argument('--elevation', type=float, help=argparse.SUPPRESS)
    p.set_defaults(func=cmd_issue)

    p = sub.add_parser('due', help="exit 0 when tonight's forecast can be made and hasn't been yet")
    ledger_arg(p)
    p.add_argument('--today', help=argparse.SUPPRESS)
    p.set_defaults(func=cmd_due)

    p = sub.add_parser('verify', help="score the ledger's forecasts against what happened")
    ledger_arg(p)
    p.add_argument('--since', help='only score evenings from this date')
    p.set_defaults(func=cmd_verify)

    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    args.guidance_dir = args.guidance_dir or args.out / 'guidance'
    args.neighbours_dir = args.neighbours_dir or args.out / 'neighbours'
    if hasattr(args, 'ledger'):
        args.ledger = args.ledger or args.out / 'ledger'
    args.func(args)


if __name__ == '__main__':
    main()
