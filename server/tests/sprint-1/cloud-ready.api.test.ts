import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/db'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Lab 5 readiness', () => {
  it('TEST-L5-01 (R-04): reports a live database without requiring a session', async () => {
    const res = await request(createApp()).get('/api/ready')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ready', db: 'connected' })
  })

  it('TEST-L5-02 (R-04, NFR-07): returns a safe 503 when the database is unreachable', async () => {
    const query = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('database connection failed'))
    try {
      const app = createApp()
      const ready = await request(app).get('/api/ready')
      expect(ready.status).toBe(503)
      expect(ready.body).toEqual({ error: { code: 'NOT_READY', message: 'Database unavailable.' } })
      expect(ready.text).not.toContain('database connection failed')
    } finally {
      query.mockRestore()
    }
  })

  it('TEST-L5-03 (NFR-01): keeps health live without session or database lookup', async () => {
    const sessionLookup = vi.spyOn(prisma.session, 'findUnique').mockRejectedValue(new Error('database unavailable'))
    try {
      const health = await request(createApp()).get('/api/health').set('Cookie', `cpm_session=${'a'.repeat(64)}`)
      expect(health.status).toBe(200)
      expect(health.body).toEqual({ status: 'ok', service: 'CoursePM API' })
      expect(sessionLookup).not.toHaveBeenCalled()
    } finally {
      sessionLookup.mockRestore()
    }
  })
})

describe('Lab 5 production client', () => {
  it('TEST-L5-04 (R-02, R-03): serves the built client and SPA routes from the API origin', async () => {
    const clientDist = fs.mkdtempSync(path.join(os.tmpdir(), 'coursepm-client-'))
    fs.writeFileSync(path.join(clientDist, 'index.html'), '<!doctype html><title>CoursePM production test</title>')
    fs.mkdirSync(path.join(clientDist, 'assets'))
    fs.writeFileSync(path.join(clientDist, 'assets', 'app.js'), 'window.coursepmReady = true')
    const previousMode = process.env.NODE_ENV
    const previousDist = process.env.CLIENT_DIST_DIR
    process.env.NODE_ENV = 'production'
    process.env.CLIENT_DIST_DIR = clientDist
    try {
      const app = createApp()
      const home = await request(app).get('/')
      const route = await request(app).get('/teams/1')
      const asset = await request(app).get('/assets/app.js')
      const unknownApi = await request(app).get('/api/does-not-exist')
      expect(home.status).toBe(200)
      expect(home.text).toContain('<!doctype html>')
      expect(route.status).toBe(200)
      expect(route.text).toBe(home.text)
      expect(asset.status).toBe(200)
      expect(asset.text).toBe('window.coursepmReady = true')
      expect(asset.headers['content-type']).toMatch(/javascript/)
      expect(unknownApi.status).toBe(404)
      expect(unknownApi.body.error.code).toBe('NOT_FOUND')
    } finally {
      if (previousMode === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousMode
      if (previousDist === undefined) delete process.env.CLIENT_DIST_DIR
      else process.env.CLIENT_DIST_DIR = previousDist
      fs.rmSync(clientDist, { recursive: true, force: true })
    }
  })
})
