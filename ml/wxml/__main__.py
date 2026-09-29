"""Command line: python -m wxml <command> (run from the ml/ folder).

  export       write the hourly and evening tables for your own analysis
  train        train the models, score them against the baselines, save them
  predict      run the saved models on the latest data and print tonight's brief
  llm-dataset  build the fine-tuning set for the Ollama forecaster
  modelfile    write an Ollama Modelfile for your fine-tuned adapter
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = ML_DIR.parent


def default_db() -> Path:
    configured = os.environ.get('DATABASE_PATH')
    if not configured:
        env_file = REPO_DIR / '.env'
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.strip().startswith('DATABASE_PATH='):
                    configured = line.split('=', 1)[1].strip().strip('"\'')
    path = Path(configured or './data/weather.db')
    return path if path.is_absolute() else (REPO_DIR / path).resolve()


def load_tables(args):
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
    return station, hourly, evenings, rows


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
    _, _, evenings, rows = load_tables(args)
    train_all({'evening': evenings, 'hourly': rows}, args.out, test_from=args.test_from)
    print(f'Models in {args.out / "models"}, scores in {args.out / "metrics.json"}')


def cmd_predict(args):
    from .brief import messages
    from .predict import forecast
    result = forecast(args.db, args.out / 'models', args.station, args.date)
    if args.ask:
        from .ollama import chat
        result['forecast'] = chat(args.ask, messages(result['brief']))
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
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('export', help='write hourly.csv and evenings.csv')
    p.set_defaults(func=cmd_export)

    p = sub.add_parser('train', help='train and score the models')
    p.add_argument('--test-from', help='first date of the held-out test period (default: last 12 months)')
    p.set_defaults(func=cmd_train)

    p = sub.add_parser('predict', help="tonight's numbers and brief")
    p.add_argument('--date', help='evening to forecast from (default: the latest)')
    p.add_argument('--ask', metavar='MODEL', help='also ask this Ollama model for the written forecast')
    p.add_argument('--json', action='store_true', help='print everything as JSON')
    p.set_defaults(func=cmd_predict)

    p = sub.add_parser('llm-dataset', help='build train.jsonl / valid.jsonl for fine-tuning')
    p.add_argument('--rewrite-with', metavar='MODEL', help='polish each draft with this local Ollama model')
    p.set_defaults(func=cmd_llm_dataset)

    p = sub.add_parser('modelfile', help='write an Ollama Modelfile')
    p.add_argument('--base', default='llama3.2:3b', help='base model the adapter was trained on')
    p.add_argument('--adapter', help='path to the LoRA adapter folder or GGUF')
    p.add_argument('--output', type=Path, help='where to write it (default: <out>/Modelfile)')
    p.set_defaults(func=cmd_modelfile)

    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    args.func(args)


if __name__ == '__main__':
    main()
