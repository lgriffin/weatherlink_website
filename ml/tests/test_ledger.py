import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pandas as pd
import pytest

from wxml.adapters.ledger_files import LedgerFiles
from wxml.adapters.publishers import FilePublisher, HttpPublisher
from wxml.forecasting.ledger import issue_forecast, ledger_scores, verify_ledger
from wxml.forecasting.ports import ForecastLedger, Publisher

NOW = pd.Timestamp('2025-01-02 18:20', tz='UTC')


def result(date='2025-01-02', night=1.5, frost=0.3):
    return {'station': 'Test', 'brief': f'Issued {date} 18:00.',
            'evening': {'date': date, 'night_min': night, 'night_min_range': [-1.0, 4.0], 'frost_chance': frost,
                        'day_max': 7.0, 'rain_next_24h_chance': 0.6},
            'guidance': {'ecmwf': {'night_min': 3.0, 'day_max': 8.0, 'rain_24h': 1.0}}}


class Words:
    def __init__(self, fail=False):
        self.fail = fail

    def write(self, brief):
        if self.fail:
            raise OSError('connection refused')
        return 'A cold night.'


def test_adapters_satisfy_the_ports(tmp_path):
    assert isinstance(LedgerFiles(tmp_path), ForecastLedger)
    assert isinstance(FilePublisher(tmp_path), Publisher)
    assert isinstance(HttpPublisher('http://x', 't'), Publisher)


def test_issue_keeps_and_publishes_once_per_evening(tmp_path):
    ledger, site = LedgerFiles(tmp_path / 'ledger'), FilePublisher(tmp_path / 'site')
    record = issue_forecast(result, ledger, NOW, narrator=Words(), narrator_name='m', publishers=(site,))
    assert record['forecast'] == 'A cold night.' and record['narrator'] == 'm'
    assert record['issued_at'] == '2025-01-02T18:20:00Z'
    assert (tmp_path / 'ledger' / '2025' / '2025-01-02.json').exists()
    assert json.loads((tmp_path / 'site' / 'forecast.json').read_text()) == record
    assert ledger.dates() == ['2025-01-02']
    # The same evening again does nothing, unless asked to replace it.
    assert issue_forecast(lambda: result(night=9.0), ledger, NOW) is None
    assert ledger.get('2025-01-02')['evening']['night_min'] == 1.5
    assert issue_forecast(lambda: result(night=9.0), ledger, NOW, replace=True)['evening']['night_min'] == 9.0


def test_an_evening_already_issued_is_sent_again_without_running(tmp_path):
    ledger, site = LedgerFiles(tmp_path / 'ledger'), FilePublisher(tmp_path / 'site')
    issued = issue_forecast(result, ledger, NOW)
    (tmp_path / 'site').mkdir(exist_ok=True)

    def must_not_run():
        raise AssertionError('ran the forecast again')

    assert issue_forecast(must_not_run, ledger, NOW, publishers=(site,), date='2025-01-02') is None
    assert json.loads((tmp_path / 'site' / 'forecast.json').read_text()) == issued


def test_an_earlier_evening_is_not_issued_as_tonight(tmp_path):
    ledger = LedgerFiles(tmp_path)
    with pytest.raises(LookupError, match='latest evening with data is 2025-01-01'):
        issue_forecast(lambda: result('2025-01-01'), ledger, NOW, date='2025-01-02')
    assert ledger.dates() == []


def test_a_failing_narrator_leaves_the_numbers(tmp_path):
    lines = []
    record = issue_forecast(result, LedgerFiles(tmp_path), NOW, narrator=Words(fail=True), log=lines.append)
    assert 'forecast' not in record and 'narrator' not in record
    assert 'connection refused' in lines[0]


def test_verify_adds_what_happened_and_scores_it(tmp_path):
    ledger = LedgerFiles(tmp_path)
    issue_forecast(result, ledger, NOW)
    issue_forecast(lambda: result('2025-01-03', night=-1.0, frost=0.8), ledger, NOW)
    outcomes = pd.DataFrame({'night_min': [-0.5, None], 'day_max': [6.0, 5.0], 'rain_24h_next': [2.0, 0.0]},
                            index=['2025-01-02', '2025-01-03'])
    assert verify_ledger(ledger, outcomes, NOW) == ['2025-01-02']   # the 3rd's night isn't known yet
    v = ledger.get('2025-01-02')['verification']
    assert v['frost'] is True and v['wet'] is True and v['night_min'] == -0.5
    assert verify_ledger(ledger, outcomes, NOW) == []                # nothing changed, nothing saved
    scores = ledger_scores(ledger)
    assert scores['evenings'] == 1 and scores['night_min_mae'] == 2.0 and scores['day_max_mae'] == 1.0
    assert scores['frost_brier'] == pytest.approx(0.49)
    assert scores['weather_models']['ecmwf']['night_min_mae'] == 3.5
    # A backlog of readings arrives and changes the night: corrected while the week is recent...
    outcomes.loc['2025-01-02', 'night_min'] = -1.5
    assert verify_ledger(ledger, outcomes, NOW) == ['2025-01-02']
    assert ledger.get('2025-01-02')['verification']['night_min'] == -1.5
    # ...but left alone once it has settled.
    outcomes.loc['2025-01-02', 'night_min'] = 0.5
    assert verify_ledger(ledger, outcomes, NOW + pd.Timedelta(days=30)) == []


def test_http_publisher_posts_to_the_ingest_api():
    seen = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            seen['path'] = self.path
            seen['auth'] = self.headers['Authorization']
            seen['source'] = self.headers['X-Source']
            seen['body'] = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            code = 201 if seen['auth'] == 'Bearer right' else 401
            body = b'{}' if code == 201 else b'{"error":{"message":"Missing or wrong upload token."}}'
            self.send_response(code)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    try:
        HttpPublisher(url, 'right', 'spark').publish('forecast', {'a': 1})
        assert seen == {'path': '/api/v1/ingest/forecast', 'auth': 'Bearer right', 'source': 'spark', 'body': {'a': 1}}
        with pytest.raises(RuntimeError, match='wrong upload token'):
            HttpPublisher(url, 'wrong').publish('forecast', {'a': 1})
    finally:
        server.shutdown()


def test_issue_and_verify_from_the_command_line(synthetic_db, trained, tables, tmp_path, capsys):
    from wxml.__main__ import main
    out, _ = trained
    base = ['--db', str(synthetic_db), '--out', str(out)]
    ledger, site = tmp_path / 'ledger', tmp_path / 'site'
    # The made-up station stopped long ago, so there is no forecast for tonight: never an older one instead.
    with pytest.raises(LookupError):
        main(base + ['issue', '--ledger', str(ledger), '--guidance', 'none'])
    assert not ledger.exists() or not list(ledger.rglob('*.json'))
    last = tables['evening'].index[-1]
    main(base + ['issue', '--ledger', str(ledger), '--guidance', 'none', '--publish', str(site), '--with-scores',
                 '--date', last])
    sent = json.loads((site / 'forecast.json').read_text())
    assert sent['brief'].startswith('Issued ') and 'issued_at' in sent
    assert 'tasks' in json.loads((site / 'model-scores.json').read_text())
    # Issue an older evening too, whose outcome is known, then verify it.
    main(base + ['issue', '--ledger', str(ledger), '--guidance', 'none', '--date', '2025-06-01'])
    capsys.readouterr()
    main(base + ['verify', '--ledger', str(ledger)])
    assert 'Verified 1 new evening' in capsys.readouterr().out
    assert json.loads((ledger / 'scores.json').read_text())['evenings'] == 1


def test_due_only_once_the_evening_reading_is_in(synthetic_db, tmp_path):
    from wxml.__main__ import main
    base = ['--db', str(synthetic_db), '--out', str(tmp_path)]
    # The made-up archive ends in August 2025, so today has no reading.
    with pytest.raises(SystemExit, match='No 17:00-18:00 reading'):
        main(base + ['due'])
    main(base + ['due', '--today', '2025-06-01'])
    LedgerFiles(tmp_path / 'ledger').save(result('2025-06-01'))
    with pytest.raises(SystemExit, match='already has a forecast'):
        main(base + ['due', '--today', '2025-06-01'])
