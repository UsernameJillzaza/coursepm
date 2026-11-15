import request from 'supertest'
import app from '../../src/app'

// Issue #3 scaffold check: the API answers, and unknown routes use the
// standard error shape (SDS §4).
describe('GET /api/health', () => {
  it('returns 200 { status: "ok" } without a session', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', service: 'CoursePM API' })
  })

  it('answers an unknown /api route with 404 in the standard error shape', async () => {
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } })
  })
})
