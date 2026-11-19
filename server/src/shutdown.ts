// Graceful shutdown for the container runtime (Lab 5, #25).
//
// `docker compose down` and Cloud Run (on scale-in or a new revision) stop the
// container with SIGTERM. In a container `node` is PID 1, and Linux gives PID 1
// no default SIGTERM action, so without a handler the signal is ignored and the
// runtime SIGKILLs the process after its grace period (10 s), cutting off any
// request still in flight. This handler stops accepting connections, lets open
// requests finish, closes the database pool, then exits.

export type Closable = { close(callback: (err?: Error) => void): unknown }

export interface ShutdownOptions {
  disconnect: () => Promise<unknown>
  exit?: (code: number) => void
  log?: (message: string) => void
  // Hard limit so a stuck keep-alive request can't outlast the runtime's grace
  // period; below Cloud Run's and Docker's 10 s default.
  timeoutMs?: number
}

export function createShutdown(server: Closable, options: ShutdownOptions) {
  const exit = options.exit ?? ((code: number) => process.exit(code))
  const log = options.log ?? console.log
  const timeoutMs = options.timeoutMs ?? 8000
  let started = false

  return (signal: string) => {
    if (started) return
    started = true
    log(`${signal} received: closing the HTTP server`)

    const timer = setTimeout(() => {
      log(`Shutdown did not finish within ${timeoutMs} ms; exiting`)
      exit(1)
    }, timeoutMs)
    timer.unref?.()

    server.close(async (err) => {
      let code = err ? 1 : 0
      try {
        await options.disconnect()
      } catch {
        code = 1
      }
      clearTimeout(timer)
      exit(code)
    })
  }
}
