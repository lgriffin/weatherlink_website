"""Publisher adapters: the site's ingest API, or a folder the site run picks up.

HttpPublisher posts to `POST /api/v1/ingest/<kind>` with the shared upload
token, as scripts/push-output.sh does. FilePublisher writes `<kind>.json`
into a folder, for GitHub Actions: the hourly site run loads those files into
its database before taking the static snapshot.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path


class HttpPublisher:
    def __init__(self, site_url: str, token: str, source: str = 'wxml', timeout: float = 30):
        self.site_url = site_url.rstrip('/')
        self.token = token
        self.source = source
        self.timeout = timeout

    def publish(self, kind: str, payload: dict) -> None:
        req = urllib.request.Request(
            f'{self.site_url}/api/v1/ingest/{kind}', method='POST',
            data=json.dumps(payload, ensure_ascii=False).encode(),
            headers={'Authorization': f'Bearer {self.token}', 'X-Source': self.source,
                     'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout):
                pass
        except urllib.error.HTTPError as err:
            try:
                message = json.loads(err.read())['error']['message']
            except Exception:  # noqa: BLE001
                message = err.reason
            raise RuntimeError(f'The site refused the {kind} ({err.code}): {message}') from None
        except urllib.error.URLError as err:
            raise RuntimeError(f'Could not reach the site: {err.reason}') from None


class FilePublisher:
    def __init__(self, folder: str | Path):
        self.folder = Path(folder)

    def publish(self, kind: str, payload: dict) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        path = self.folder / f'{kind}.json'
        tmp = path.with_name(f'.{path.name}.tmp')
        tmp.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + '\n')
        tmp.replace(path)
