import json
import re
from pathlib import Path

import pandas as pd
import pytest

from wxml import llm_dataset
from wxml.__main__ import modelfile
from wxml.analogs import find_analogs
from wxml.brief import SYSTEM_PROMPT

NUMBER = re.compile(r'-?\d+(?:\.\d+)?')


@pytest.fixture(scope='module')
def dataset(tables):
    return llm_dataset.build(tables['evening'], tables['rows'], log=lambda _: None)


def test_examples_are_chat_formatted(dataset, tmp_path):
    llm_dataset.write(dataset, tmp_path)
    lines = (tmp_path / 'train.jsonl').read_text().splitlines()
    assert len(lines) == len(dataset['train']) > 500
    first = json.loads(lines[0])
    assert [m['role'] for m in first['messages']] == ['system', 'user', 'assistant']
    assert first['messages'][0]['content'] == SYSTEM_PROMPT
    assert (tmp_path / 'review.csv').exists()


def test_validation_examples_come_after_training_ones(dataset):
    assert max(e['date'] for e in dataset['train']) < min(e['date'] for e in dataset['valid'])


def test_drafts_only_state_numbers_from_the_brief(dataset):
    for ex in dataset['train'] + dataset['valid']:
        given = [float(n) for n in NUMBER.findall(ex['brief'])]
        for sentence in re.split(r'(?<=\.)\s', ex['answer']):
            if 'than usual' in sentence:  # a difference of two numbers in the brief
                continue
            for n in NUMBER.findall(sentence):
                assert any(abs(float(n) - g) <= 0.5 for g in given), (ex['date'], n, ex['answer'])


def test_briefs_never_contain_the_answer(dataset):
    for ex in dataset['valid']:
        assert f"{ex['outcome']['night_min']:.2f}" not in ex['brief']
        assert 'Issued ' + ex['date'] in ex['brief']


def test_analogs_are_earlier_evenings_only(tables):
    evenings = tables['evening']
    date = evenings.index[400]
    analogs = find_analogs(evenings, date)
    assert len(analogs) == 5
    cutoff = (pd.Timestamp(date) - pd.Timedelta(days=3)).strftime('%Y-%m-%d')
    assert all(d < cutoff for d in analogs.index)


def test_example_modelfile_matches_the_training_prompt():
    example = Path(__file__).resolve().parent.parent / 'ollama' / 'Modelfile.example'
    assert example.read_text() == modelfile('llama3.2:3b', './adapters')


@pytest.fixture(scope='module')
def guided_dataset(tables, guidance):
    return llm_dataset.build(tables['evening'], tables['rows'], log=lambda _: None, guidance=guidance,
                             tz=tables['station'].timezone)


def test_briefs_say_what_the_weather_models_said(guided_dataset):
    from wxml.brief import guidance_lines
    briefs = [ex['brief'] for ex in guided_dataset['valid']]
    assert all("Weather models, tonight's low: cool model" in b and 'warm model' in b for b in briefs)
    assert any('they disagree by' in b for b in briefs) and any('wet in' in b for b in briefs)
    assert guidance_lines({'ecmwf_ifs025': {'night_min': 3.0, 'day_max': None, 'rain_24h': 0.0},
                           'ukmo_seamless': {'night_min': 0.5, 'day_max': None, 'rain_24h': 1.2}}) == [
        "Weather models, tonight's low: ECMWF 3.0C, Met Office 0.5C (they disagree by 2.5C).",
        'Weather models, rain by 18:00 tomorrow: wet in 1 of 2 (up to 1.2 mm).',
    ]


def test_every_draft_passes_the_word_checks(guided_dataset, dataset):
    from wxml.eval_words import check
    for ex in guided_dataset['train'] + guided_dataset['valid'] + dataset['valid']:
        result = check(ex['brief'], ex['answer'])
        assert all(v is not False for v in result.values()), (ex['date'], result, ex['brief'], ex['answer'])
    flagged = [ex for ex in guided_dataset['valid'] if check(ex['brief'], ex['answer'])['disagreement']]
    assert flagged, 'some validation evenings should test the disagreement check'


def test_word_checks_catch_the_usual_mistakes():
    from wxml.eval_words import check
    brief = ("Issued 2025-01-02 18:00.\nModel: overnight low -0.5C (likely range -3.0C to 2.0C); frost chance 62%; "
             "rain by 18:00 tomorrow 80%; tomorrow's high 6.0C.\nNormal for date: low 3.5C, high 8.0C.\n"
             "Weather models, tonight's low: ECMWF 1.5C, Met Office -1.0C (they disagree by 2.5C).")
    good = ('A frost is likely tonight, with a low near -0.5°C, possibly -3°C. About 4 degrees colder than usual. '
            'Rain is likely before tomorrow evening, topping out at 6°C. The models disagree a little.')
    assert all(v is not False for v in check(brief, good).values())
    bad = check(brief, 'Dry and mild, with a low of 7°C.')
    assert bad == {'numbers': False, 'frost': False, 'rain': False, 'disagreement': False, 'length': True}
    calm = brief.replace('frost chance 62%', 'frost chance 2%')
    assert check(calm, 'A sharp frost tonight.')['frost'] is False
    assert check(calm, 'No frost tonight.')['frost'] is True
    assert check(brief, ' '.join(['word'] * 130))['length'] is False
    # Denials don't count as mentions, and the disagreement must be the weather models'.
    assert check(brief, 'No frost tonight.')['frost'] is False
    assert check(brief, 'No rain tomorrow.')['rain'] is False
    assert check(brief, 'Treat the low with some caution.')['disagreement'] is False
    assert check(calm, 'Frost is not expected.')['frost'] is True
    # A difference counts only between two temperatures in the brief, however it's written.
    assert check(brief, 'About 4°C colder than usual.')['numbers'] is True
    assert check(brief, 'A low of 22 degrees.')['numbers'] is False  # 80 - 58, but those aren't temperatures


def test_ledger_briefs_issued_before_the_models_section_get_no_model_numbers():
    from wxml.eval_words import check
    record = {'brief': 'Issued 2025-08-20 18:00.\nModel: overnight low 9.0C (likely range 7.0C to 11.0C); '
                       'frost chance 0%; rain by 18:00 tomorrow 75%.',
              'guidance': {'ecmwf_ifs025': {'night_min': 5.0}, 'ukmo_seamless': {'night_min': 12.0}},
              'evening': {'date': '2025-08-20', 'night_min': 9.0, 'night_min_range': [7.0, 11.0], 'frost_chance': 0.0,
                          'day_max': None, 'rain_next_24h_chance': 0.75, 'normal_low': None, 'analogs': []},
              'verification': {'night_min': 8.5, 'day_max': 16.0, 'rain_24h_mm': 3.0}}
    [ex] = llm_dataset.from_ledger([record])
    assert 'weather models' not in ex['answer'] and check(ex['brief'], ex['answer'])['numbers']


def test_ledger_evenings_keep_their_issued_briefs(tables):
    record = {'brief': 'Issued 2025-08-20 18:00.\nModel: overnight low 9.0C (likely range 7.0C to 11.0C); '
                       'frost chance 0%; rain by 18:00 tomorrow 75%.',
              'evening': {'date': '2025-08-20', 'night_min': 9.0, 'night_min_range': [7.0, 11.0], 'frost_chance': 0.0,
                          'day_max': 17.0, 'rain_next_24h_chance': 0.75, 'normal_low': 10.0,
                          'analogs': [{'date': '2024-08-20', 'night_min': 10.0, 'rain_24h_next': 1.0}]},
              'verification': {'night_min': 8.5, 'day_max': 16.0, 'rain_24h_mm': 3.0, 'frost': False, 'wet': True}}
    split = llm_dataset.build(tables['evening'], tables['rows'], log=lambda _: None, ledger_records=[record])
    ex = next(e for e in split['train'] + split['valid'] if e['date'] == '2025-08-20')
    assert ex['source'] == 'ledger' and ex['brief'] == record['brief']
    assert ex['answer'].startswith('A low of around 9°C tonight.') and 'Rain is likely' in ex['answer']


def test_eval_words_against_a_local_ollama(tmp_path, monkeypatch, capsys):
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    from wxml.__main__ import main
    from wxml.eval_words import write_eval_set

    class Ollama(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            asked = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            assert asked['model'] == 'stock:3b' and asked['messages'][0]['content'] == SYSTEM_PROMPT
            body = json.dumps({'message': {'content': 'A low of 42°C tonight.'}}).encode()
            self.send_response(200)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(('127.0.0.1', 0), Ollama)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv('OLLAMA_HOST', f'127.0.0.1:{server.server_port}')
    write_eval_set([{'date': '2025-01-02', 'brief': 'Issued 2025-01-02 18:00.\nModel: overnight low 3.0C; '
                                                    'frost chance 10%.'}], tmp_path / 'llm' / 'eval.jsonl')
    try:
        main(['--out', str(tmp_path), 'eval-words', '--model', 'stock:3b'])
    finally:
        server.shutdown()
    out = capsys.readouterr().out
    assert 'all checks passed on 0% of 1 forecasts' in out and 'numbers: 0% of 1' in out
    report = json.loads((tmp_path / 'llm' / 'eval-stock_3b.json').read_text())
    assert report['failures'][0]['failed'] == ['numbers']


def test_eval_words_says_when_ollama_is_not_running(tmp_path, monkeypatch):
    from wxml.__main__ import main
    from wxml.eval_words import write_eval_set
    monkeypatch.setenv('OLLAMA_HOST', '127.0.0.1:9')
    write_eval_set([{'date': 'd', 'brief': 'Issued d 18:00.'}], tmp_path / 'llm' / 'eval.jsonl')
    with pytest.raises(SystemExit, match='Is `ollama serve` running'):
        main(['--out', str(tmp_path), 'eval-words', '--model', 'x'])
