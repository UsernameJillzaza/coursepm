// MAN-01 (NFR-06: data survives an API restart) and MAN-02 (NFR-04: session
// cookie flags) on the release code (v0.1.0). Starts the API and the client,
// drives Edge through the real UI, stops the API process, starts it again,
// and records everything in man-checks.txt plus screenshots.
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const { chromium } = require(require.resolve('@playwright/test', { paths: [REPO] }))
const OUT = __dirname
const log = []
const say = (s) => { const line = `[${new Date().toISOString()}] ${s}`; log.push(line); console.log(line) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pw = fs.readFileSync(path.join(REPO, 'server/.env'), 'utf8').match(/^SEED_PASSWORD=(.+)$/m)[1].trim().replace(/^"|"$/g, '')

function start(name, cmd, cwd) {
  const p = spawn(cmd, { cwd, shell: true })
  p.stdout.on('data', (d) => fs.appendFileSync(path.join(OUT, `${name}.out.txt`), d))
  p.stderr.on('data', (d) => fs.appendFileSync(path.join(OUT, `${name}.out.txt`), d))
  return p
}
function stop(p) { try { execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: 'ignore' }) } catch {} }
async function waitUp(url, up = true, ms = 60000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    let ok = false
    try { ok = (await fetch(url)).ok } catch {}
    if (ok === up) return true
    await sleep(500)
  }
  throw new Error(`${url} did not become ${up ? 'reachable' : 'unreachable'}`)
}

;(async () => {
  for (const f of ['api.out.txt', 'client.out.txt']) fs.rmSync(path.join(OUT, f), { force: true })
  say(`commit ${execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim()} (${execSync('git describe --tags', { cwd: REPO }).toString().trim()})`)
  let api = start('api', 'npx tsx src/server.ts', path.join(REPO, 'server'))
  const client = start('client', 'npx vite --port 5173 --strictPort', path.join(REPO, 'client'))
  await waitUp('http://localhost:3000/api/health'); await waitUp('http://localhost:5173')
  say('API (pid ' + api.pid + ') and client are up')

  const browser = await chromium.launch({ channel: 'msedge' })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()
  try {
    // ---------- MAN-02: cookie flags ----------
    await page.goto('http://localhost:5173/login')
    await page.getByLabel('E-mail').fill('supervisor1@coursepm.test')
    await page.getByLabel('Password').fill(pw)
    const [loginRes] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/auth/login')),
      page.getByRole('button', { name: 'Log in' }).click(),
    ])
    await page.getByText('My teams').first().waitFor()
    const setCookie = (await loginRes.headerValue('set-cookie')) || ''
    const shown = setCookie.replace(/cpm_session=[^;]+/, 'cpm_session=<token hidden>')
    say(`MAN-02 login → ${loginRes.status()}; Set-Cookie: ${shown}`)
    const c = (await ctx.cookies()).find((k) => k.name === 'cpm_session')
    const hours = ((c.expires * 1000 - Date.now()) / 3600e3).toFixed(2)
    const rec = { name: c.name, domain: c.domain, path: c.path, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, expiresInHours: hours }
    say('MAN-02 browser cookie store: ' + JSON.stringify(rec))
    const jsSees = await page.evaluate(() => document.cookie.includes('cpm_session'))
    say(`MAN-02 document.cookie contains cpm_session: ${jsSees} (HttpOnly → must be false)`)
    const pass2 = c.httpOnly && c.sameSite === 'Lax' && c.path === '/' && !c.secure && !jsSees && Math.abs(hours - 8) < 0.1
    say(`MAN-02 result: ${pass2 ? 'PASS' : 'FAIL'} (expected HttpOnly, SameSite=Lax, Path=/, ~8 h expiry, Secure off on http://localhost in development)`)

    const ev = await ctx.newPage()
    await ev.setContent(`<html><body style="font:15px Segoe UI;padding:24px">
      <h2 style="margin:0 0 6px">MAN-02 — session cookie after a real login (Edge)</h2>
      <div style="color:#555;margin-bottom:12px">v0.1.0 · supervisor1@coursepm.test · http://localhost:5173 · ${new Date().toString()}</div>
      <table border="1" cellpadding="6" style="border-collapse:collapse">
      ${Object.entries(rec).map(([k, v]) => `<tr><th align="left">${k}</th><td>${v}</td></tr>`).join('')}
      <tr><th align="left">visible to JavaScript (document.cookie)</th><td>${jsSees}</td></tr></table>
      <p><b>Set-Cookie (login response):</b><br><code>${shown.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></p>
      <p style="font-size:20px"><b>Result: ${pass2 ? 'PASS' : 'FAIL'}</b></p></body></html>`)
    await ev.screenshot({ path: path.join(OUT, 'man-02-cookie-flags.png') })
    await ev.close()

    // ---------- MAN-01: restart persistence ----------
    const teams = await (await page.request.get('http://localhost:5173/api/teams')).json()
    const alpha = teams.items.find((t) => t.name === 'Team Alpha')
    const title = `MAN-01 restart check ${Date.now()}`
    const deadline = new Date(Date.now() + 7 * 864e5).toISOString()
    const created = await page.request.post(`http://localhost:5173/api/teams/${alpha.id}/milestones`, { data: { title, description: 'Created before the API restart.', deadline, maxRevisions: 2 } })
    const mid = (await created.json()).milestone.id
    say(`MAN-01 created milestone ${mid} "${title}" → ${created.status()}`)
    await page.goto(`http://localhost:5173/milestones/${mid}`)
    await page.getByRole('heading', { name: title }).waitFor()
    await page.getByText('No submissions yet').or(page.getByRole('article')).first().waitFor()
    await page.waitForFunction(() => !document.querySelector('[role=status][aria-label=Loading]'))
    await page.screenshot({ path: path.join(OUT, 'man-01-before-restart.png') })

    stop(api)
    await waitUp('http://localhost:3000/api/health', false, 20000)
    say('MAN-01 API process stopped; /api/health unreachable')
    api = start('api', 'npx tsx src/server.ts', path.join(REPO, 'server'))
    await waitUp('http://localhost:3000/api/health')
    say('MAN-01 API started again (new pid ' + api.pid + ')')

    const me = await page.request.get('http://localhost:5173/api/auth/me')
    say(`MAN-01 same browser session after restart: GET /api/auth/me → ${me.status()} ${JSON.stringify((await me.json()).user ?? {})}`)
    const again = await page.request.get(`http://localhost:5173/api/milestones/${mid}`)
    const body = await again.json()
    say(`MAN-01 GET /api/milestones/${mid} after restart → ${again.status()}, title "${body.milestone?.title}"`)
    await page.reload()
    await page.getByRole('heading', { name: title }).waitFor()
    await page.getByText('No submissions yet').or(page.getByRole('article')).first().waitFor()
    await page.waitForFunction(() => !document.querySelector('[role=status][aria-label=Loading]'))
    await page.screenshot({ path: path.join(OUT, 'man-01-after-restart.png') })
    const pass1 = me.status() === 200 && again.status() === 200 && body.milestone?.title === title
    say(`MAN-01 result: ${pass1 ? 'PASS' : 'FAIL'} (milestone and session still present after the API restart)`)
  } finally {
    await browser.close()
    stop(api); stop(client)
    fs.writeFileSync(path.join(OUT, 'man-checks.txt'), 'CoursePM manual checks MAN-01 / MAN-02 on v0.1.0 (scripted in Edge by Claude Code for the team)\n' + log.join('\n') + '\n')
  }
})().catch((e) => { say('ERROR ' + e.message); process.exitCode = 1 })
