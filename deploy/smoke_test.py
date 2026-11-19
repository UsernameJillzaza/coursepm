"""Read-only checks of the live CoursePM deployment (#29). Uses no credentials.

    python3 deploy/smoke_test.py SERVICE_URL

Called by .github/workflows/deploy.yml after a release; exits non-zero if any
check fails. Each check retries up to 5 times, 3 seconds apart, to ride out a
Cloud Run cold start. Uses only the Python standard library.

Checks, in order:
  1. GET /api/health     -> 200 {"status": "ok"}
  2. GET /api/ready      -> 200 {"db": "connected"} (proves Cloud SQL works)
  3. GET /               -> 200 HTML that loads a /assets/*.js bundle
  4. GET /api/teams      -> 401 UNAUTHENTICATED (API reachable, auth guard on)
  5. EXPECTED_COMMIT set -> that full SHA is in the bundle the page loads, so
     the running release is the commit the workflow built (C-06)

Nothing is created or changed and no account is used, so the deploy job needs
no demo password. Sign-in on the live URL is checked by hand (#30).
Offline tests: deploy/tests/test_smoke.py (TEST-L5-11)
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ATTEMPTS = 5
DELAY_SECONDS = 3
SCRIPT_SRC = re.compile(rb'<script[^>]+src="(/assets/[^"]+\.js)"')


def fetch(base, path):
    """GET base+path and return (status, body). HTTP errors are returned, not raised."""
    try:
        with urllib.request.urlopen(base + path, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def json_field(body, *keys):
    value = json.loads(body)
    for key in keys:
        value = value[key]
    return value


def expect(name, attempt_check):
    """Run one check with retries; attempt_check returns True on success."""
    for attempt in range(ATTEMPTS):
        try:
            if attempt_check():
                print('PASS ' + name)
                return
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError):
            pass
        if attempt < ATTEMPTS - 1:
            time.sleep(DELAY_SECONDS)
    raise RuntimeError('Smoke check failed: ' + name)


def check(base, expected_commit=None):
    expect('/api/health', lambda: _ok(fetch(base, '/api/health'), lambda b: json_field(b, 'status') == 'ok'))
    expect('/api/ready', lambda: _ok(fetch(base, '/api/ready'), lambda b: json_field(b, 'db') == 'connected'))

    page = {}

    def html():
        status, body = fetch(base, '/')
        match = SCRIPT_SRC.search(body) if status == 200 else None
        if match and b'<html' in body.lower():
            page['bundle'] = match.group(1).decode()
            return True
        return False

    expect('/ (client HTML and bundle)', html)
    expect('/api/teams requires a session', lambda: _status(
        fetch(base, '/api/teams'), 401, lambda b: json_field(b, 'error', 'code') == 'UNAUTHENTICATED'))

    if expected_commit:
        if not re.fullmatch(r'[0-9a-f]{40}', expected_commit):
            raise RuntimeError('EXPECTED_COMMIT must be a full 40-character SHA.')
        expect('release commit ' + expected_commit[:7] + ' is in the served bundle', lambda: _ok(
            fetch(base, page['bundle']), lambda b: expected_commit.encode() in b))
    else:
        print('SKIP release commit check: EXPECTED_COMMIT not set')


def _ok(result, predicate):
    return _status(result, 200, predicate)


def _status(result, expected, predicate):
    status, body = result
    return status == expected and predicate(body)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 deploy/smoke_test.py SERVICE_URL')
    check(sys.argv[1].rstrip('/'), expected_commit=os.getenv('EXPECTED_COMMIT') or None)
