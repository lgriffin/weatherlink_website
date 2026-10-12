"""A small HTTP GET with retries, shared by the adapters that read public APIs."""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from typing import Callable

USER_AGENT = 'weatherlink_website-wxml (+https://github.com/lgriffin/weatherlink_website)'
RETRY_CODES = (429, 500, 502, 503, 504)


class Unreachable(RuntimeError):
    """The service could not be reached at all (as opposed to answering with an error)."""


def get_bytes(url: str, what: str, timeout: float = 60, attempts: int = 3,
              sleep: Callable[[float], None] = time.sleep) -> bytes:
    """The body of `url`. Errors name `what`, never the URL (it can hold the station's position)."""
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as err:
            if err.code in RETRY_CODES and attempt < attempts:
                sleep(5 * attempt)
                continue
            raise RuntimeError(f'{what} answered {err.code}: {err.reason}') from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            if attempt < attempts:
                sleep(5 * attempt)
                continue
            raise Unreachable(f'Could not reach {what}: {getattr(err, "reason", err)}') from None
    raise AssertionError('unreachable')
