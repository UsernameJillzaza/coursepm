import type { Request, Response } from 'express'
import { sendError } from '../http'

// F-10 GET /api/teams/:teamId/board. Stub until the GREEN commit, so the RED
// API tests reach the route and fail on their assertions.
export async function getTeamBoard(_req: Request, res: Response) {
  sendError(res, 501, 'NOT_IMPLEMENTED', 'Not implemented.')
}
