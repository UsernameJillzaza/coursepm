"""Live post-deploy checks for the v0.3.0 release (Lab 7 CHG-01 + Sprint 2 spot checks).

Usage:
  python live_check.py https://<service-url>            # journey; creates a new milestone
  python live_check.py https://<service-url> --check N  # persistence re-check of milestone N

The demo password is read with getpass (not echoed, not stored, never printed).
Only HTTP statuses, error codes and record IDs are printed.
"""
import getpass
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = sys.argv[1].rstrip('/')
FAILS = []


class Client:
    def __init__(self, label):
        self.label = label
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method)
        req.add_header('Content-Type', 'application/json')
        req.add_header('Accept', 'application/json')
        try:
            with self.opener.open(req, timeout=30) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw)
            except ValueError:
                return e.code, {}


def code_of(payload):
    err = payload.get('error') if isinstance(payload, dict) else None
    return err.get('code') if isinstance(err, dict) else None


def expect(name, got, want, payload=None, want_code=None):
    ok = got == want and (want_code is None or code_of(payload or {}) == want_code)
    extra = f" {code_of(payload or {})}" if code_of(payload or {}) else ''
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {got}{extra} (expected {want}{' ' + want_code if want_code else ''})")
    if not ok:
        FAILS.append(name)
    return ok


def login(email, password):
    c = Client(email)
    s, p = c.call('POST', '/api/auth/login', {'email': email, 'password': password})
    expect(f'login {email}', s, 200, p)
    return c


def team_id(client, name):
    _, p = client.call('GET', '/api/teams')
    teams = p.get('items', [])
    return next((t['id'] for t in teams if t.get('name') == name), None)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


password = getpass.getpass('Demo password (SEED_PASSWORD): ')
sup = login('supervisor1@coursepm.test', password)
stu = login('alpha1@coursepm.test', password)

if '--check' in sys.argv:
    m = sys.argv[sys.argv.index('--check') + 1]
    s, p = stu.call('GET', f'/api/milestones/{m}/submissions')
    subs = p.get('items', [])
    expect('persist: milestone still has 2 revisions', len(subs), 2)
    s, p = sup.call('GET', f'/api/milestones/{m}/history')
    expect('persist: change history readable', s, 200, p)
    s, p = stu.call('GET', f'/api/milestones/{m}')
    ms = p.get('milestone', {})
    expect('persist: milestone still closed', bool(ms.get('closedAt')), True)
    print('\nRESULT:', 'ALL PASS' if not FAILS else f'FAILED: {FAILS}')
    sys.exit(1 if FAILS else 0)

alpha = team_id(sup, 'Team Alpha')
stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
print(f'Team Alpha id = {alpha}')

# Supervisor creates a new milestone (a fresh revision count for the CHG-01 journey).
s, p = sup.call('POST', f'/api/teams/{alpha}/milestones', {
    'title': f'Lab 7 live CHG-01 {stamp}', 'description': 'Post-deploy check of v0.3.0.',
    'deadline': iso(datetime.now(timezone.utc) + timedelta(days=7)), 'maxRevisions': 3,
})
expect('F-04 supervisor creates milestone', s, 201, p)
mid = p.get('milestone', {}).get('id')
print(f'Milestone id = {mid}')

# CHG-01 (Lab 7): revision 1 → revision 2 blocked until feedback → revision 2 accepted.
sub = {'title': 'Live revision 1', 'description': 'First draft.', 'link': 'https://example.com/lab7-rev1'}
s, p = stu.call('POST', f'/api/milestones/{mid}/submissions', sub)
expect('CHG-01 revision 1', s, 201, p)
rev1 = p.get('submission', {}).get('id')
s, p = stu.call('POST', f'/api/milestones/{mid}/submissions', {**sub, 'title': 'Live revision 2', 'link': 'https://example.com/lab7-rev2'})
expect('CHG-01 revision 2 before feedback', s, 409, p, 'AWAITING_FEEDBACK')
s, p = sup.call('POST', f'/api/submissions/{rev1}/feedback', {'body': 'Live check feedback on revision 1.'})
expect('F-06 supervisor feedback on revision 1', s, 201, p)
s, p = stu.call('POST', f'/api/milestones/{mid}/submissions', {**sub, 'title': 'Live revision 2', 'link': 'https://example.com/lab7-rev2'})
expect('CHG-01 revision 2 after feedback', s, 201, p)

# Preserved paths: scope 404 and role 403.
sup2 = login('supervisor2@coursepm.test', password)
beta = team_id(sup2, 'Team Beta')
s, p = stu.call('GET', f'/api/teams/{beta}/milestones')
expect('scope: alpha student reads Team Beta milestones', s, 404, p, 'NOT_FOUND')
s, p = sup2.call('GET', f'/api/milestones/{mid}/submissions')
expect('scope: unassigned supervisor reads Alpha milestone', s, 404, p, 'NOT_FOUND')
s, p = stu.call('POST', f'/api/teams/{alpha}/milestones', {
    'title': 'Student should not create', 'description': '', 'deadline': iso(datetime.now(timezone.utc) + timedelta(days=7)), 'maxRevisions': 3,
})
expect('role: student creates milestone', s, 403, p, 'FORBIDDEN')

# Sprint 2 spot checks.
s, p = stu.call('GET', f'/api/milestones/{mid}/compare?a=1&b=2')
expect('F-07 compare revisions 1 and 2', s, 200, p)
s, p = sup.call('POST', f'/api/milestones/{mid}/extensions', {
    'newDeadline': iso(datetime.now(timezone.utc) + timedelta(days=10)), 'reason': 'Live check extension.',
})
expect('F-08 extension', s, 201, p)
s, p = stu.call('GET', f'/api/teams/{alpha}/board')
expect('F-10 progress board', s, 200, p)
admin = login('admin@coursepm.test', password)
s, p = admin.call('GET', '/api/admin/teams')
expect('F-09 admin lists teams', s, 200, p)
s, p = stu.call('GET', '/api/admin/teams')
expect('F-09 student on /api/admin/teams', s, 403, p, 'FORBIDDEN')
s, p = sup.call('POST', f'/api/milestones/{mid}/close', {'reason': 'Live check close.'})
expect('F-08 close milestone', s, 200, p)
s, p = stu.call('POST', f'/api/milestones/{mid}/submissions', {**sub, 'title': 'Live revision 3'})
expect('F-08 submit after close', s, 409, p, 'MILESTONE_CLOSED')

print(f'\nMilestone for the persistence re-check: {mid}')
print('RESULT:', 'ALL PASS' if not FAILS else f'FAILED: {FAILS}')
sys.exit(1 if FAILS else 0)
