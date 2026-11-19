"""TEST-L5-11 (C-06): offline unit tests for deploy/smoke_test.py (#29); the network is mocked.

Run from the repo root:
    python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'
"""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).parents[1] / 'smoke_test.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

SHA = 'de9213ebf000c224c44bab66b9990f99119c81ab'
BASE = 'https://coursepm.example.test'


def site(overrides=None):
    """A fake live site; overrides maps path -> (status, body)."""
    pages = {
        '/api/health': (200, b'{"status":"ok","service":"CoursePM API"}'),
        '/api/ready': (200, b'{"status":"ready","db":"connected"}'),
        '/': (200, b'<!doctype html><html><script type="module" crossorigin src="/assets/index-abc.js"></script></html>'),
        '/api/teams': (401, b'{"error":{"code":"UNAUTHENTICATED","message":"Please log in."}}'),
        '/assets/index-abc.js': (200, b'const r="' + SHA.encode() + b'";'),
    }
    pages.update(overrides or {})
    calls = []

    def fake_fetch(base, path):
        calls.append(path)
        return pages[path]
    return fake_fetch, calls


class SmokeTests(unittest.TestCase):
    def run_check(self, overrides=None, **kwargs):
        fake, calls = site(overrides)
        with patch.object(smoke, 'fetch', side_effect=fake), patch.object(smoke.time, 'sleep'):
            smoke.check(BASE, **kwargs)
        return calls

    def assert_fails(self, message, overrides=None, **kwargs):
        with self.assertRaisesRegex(RuntimeError, message):
            self.run_check(overrides, **kwargs)

    def test_L5_11_public_checks_and_release_commit_pass(self):
        calls = self.run_check(expected_commit=SHA)
        self.assertEqual(calls, ['/api/health', '/api/ready', '/', '/api/teams', '/assets/index-abc.js'])

    def test_L5_11_db_not_connected_fails_even_with_http_200(self):
        self.assert_fails('/api/ready', {'/api/ready': (200, b'{"status":"ready","db":"disconnected"}')})

    def test_L5_11_open_api_without_a_session_fails(self):
        self.assert_fails('/api/teams', {'/api/teams': (200, b'[]')})

    def test_L5_11_bundle_from_another_commit_fails(self):
        self.assert_fails('release commit', {'/assets/index-abc.js': (200, b'const r="0000000";')}, expected_commit=SHA)

    def test_L5_11_malformed_expected_commit_is_rejected(self):
        self.assert_fails('40-character', expected_commit='de9213e')

    def test_L5_11_cold_start_is_retried(self):
        answers = iter([(503, b'starting'), (200, b'{"status":"ok"}')])
        fake, _ = site()

        def flaky(base, path):
            return next(answers) if path == '/api/health' else fake(base, path)
        with patch.object(smoke, 'fetch', side_effect=flaky), patch.object(smoke.time, 'sleep') as sleep:
            smoke.check(BASE)
        sleep.assert_called_once_with(smoke.DELAY_SECONDS)


if __name__ == '__main__':
    unittest.main()
