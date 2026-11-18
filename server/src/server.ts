import 'dotenv/config'
import app from './app'
import { prisma } from './db'
import { createShutdown } from './shutdown'

const PORT = Number(process.env.PORT) || 3000

const server = app.listen(PORT, () => {
  console.log(`CoursePM API listening on http://localhost:${PORT}`)
})

// Containers are stopped with SIGTERM (Cloud Run, docker compose down); Ctrl+C
// sends SIGINT locally. See shutdown.ts for why PID 1 needs this.
const shutdown = createShutdown(server, { disconnect: () => prisma.$disconnect() })
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
