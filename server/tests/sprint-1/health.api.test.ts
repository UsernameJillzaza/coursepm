import request from 'supertest'
import app from '../../src/app'

// R-01 scaffold checks (contract R-01-R-02-scaffold.md).
describe('GET /api/health', () => {
  it('TEST-R01-01 (AC-R01-1): returns 200 { status: "ok", service: "CoursePM API" } without a session', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'broken-on-purpose', service: 'CoursePM API' }) // C-02: deliberately wrong; never merge
  })

  it('TEST-R01-03 / TEST-02-07 (AC-R01-3, AC-02-8): an unknown /api route → 404 NOT_FOUND "Not found." with no internal details', async () => {
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } })
    expect(res.text).not.toMatch(/stack|prisma|SELECT|at \w/i)
  })
})
