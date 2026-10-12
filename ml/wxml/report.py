"""The training scores as a Markdown table (for a GitHub job summary or a README)."""

from __future__ import annotations

BASELINES = ['station_only', 'guidance', 'climatology', 'persistence']
LABELS = {'station_only': 'station only', 'guidance': 'raw guidance'}


def _rows(name: str, r: dict) -> list[str]:
    metric = 'brier' if 'brier' in r else 'mae'
    scores, skill = r[metric], r.get('skill', {})
    cells = [f'`{name}`', f"{metric.upper() if metric == 'mae' else 'Brier'} {scores['model']:.3f}"]
    for base in BASELINES:
        if base in scores:
            s = skill.get(f'vs_{base}')
            cells.append(f"{scores[base]:.3f} ({'n/a' if s is None else f'{s:+.0%}'})")
        else:
            cells.append('')
    cells.append(str(r.get('test_rows', '')))
    return ['| ' + ' | '.join(cells) + ' |']


def markdown(report: dict) -> str:
    head = ['task', 'model'] + [LABELS.get(b, b) for b in BASELINES] + ['test rows']
    lines = ['| ' + ' | '.join(head) + ' |', '|' + '---|' * len(head)]
    skipped = []
    for name, r in report.get('tasks', {}).items():
        if 'skipped' in r:
            skipped.append(f'- `{name}` skipped: {r["skipped"]}')
            continue
        lines += _rows(name, r)
        if 'frost_tonight' in r:
            f = r['frost_tonight']
            lines += _rows(f'{name}: frost', {**f, 'test_rows': f.get('frost_nights_in_test', '')})
    notes = [
        '',
        'Each baseline shows its score and, in brackets, the model\'s skill against it '
        '(above 0 means the model did better). Frost rows count frost nights instead of test rows. '
        'A `+guidance` model is scored on the days that have guidance, and is used for forecasts only '
        'when it beat the station-only model.',
    ]
    return '\n'.join(lines + ([''] + skipped if skipped else []) + notes) + '\n'
