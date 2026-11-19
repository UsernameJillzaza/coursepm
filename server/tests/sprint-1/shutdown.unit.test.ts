import { afterEach, describe, expect, it, vi } from 'vitest'
import { createShutdown, type Closable } from '../../src/shutdown'

// Lab 5 (#25): the container must stop promptly on SIGTERM instead of waiting
// for the runtime's SIGKILL. These cases use a fake server, so no port is bound.
function fakeServer(closeError?: Error) {
  let onClosed: ((err?: Error) => void) | undefined
  const server: Closable & { finish(): void; close: ReturnType<typeof vi.fn> } = {
    close: vi.fn((cb: (err?: Error) => void) => {
      onClosed = cb
    }),
    finish: () => onClosed?.(closeError),
  }
  return server
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

afterEach(() => {
  vi.useRealTimers()
})

describe('Lab 5 graceful shutdown', () => {
  it('TEST-L5-05 (R-04): closes the server, then the database, then exits 0', async () => {
    const server = fakeServer()
    const order: string[] = []
    const disconnect = vi.fn(async () => {
      order.push('disconnect')
    })
    const exit = vi.fn((code: number) => {
      order.push(`exit ${code}`)
    })
    createShutdown(server, { disconnect, exit, log: () => {} })('SIGTERM')

    expect(server.close).toHaveBeenCalledTimes(1)
    expect(disconnect).not.toHaveBeenCalled() // open requests finish first
    server.finish()
    await flush()
    expect(order).toEqual(['disconnect', 'exit 0'])
  })

  it('TEST-L5-06 (R-04): a second signal does not start a second shutdown', async () => {
    const server = fakeServer()
    const exit = vi.fn()
    const shutdown = createShutdown(server, { disconnect: async () => {}, exit, log: () => {} })
    shutdown('SIGTERM')
    shutdown('SIGINT')
    server.finish()
    await flush()
    expect(server.close).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('TEST-L5-07 (R-04): exits 1 when closing fails or the timeout passes', async () => {
    const failing = fakeServer()
    const exitOnError = vi.fn()
    createShutdown(failing, {
      disconnect: async () => {
        throw new Error('pool already closed')
      },
      exit: exitOnError,
      log: () => {},
    })('SIGTERM')
    failing.finish()
    await flush()
    expect(exitOnError).toHaveBeenCalledWith(1)

    vi.useFakeTimers()
    const stuck = fakeServer() // never calls back: a request that won't finish
    const exitOnTimeout = vi.fn()
    createShutdown(stuck, { disconnect: async () => {}, exit: exitOnTimeout, log: () => {}, timeoutMs: 8000 })('SIGTERM')
    vi.advanceTimersByTime(7999)
    expect(exitOnTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(exitOnTimeout).toHaveBeenCalledWith(1)
  })
})
