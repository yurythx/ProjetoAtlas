import { NextResponse } from 'next/server'

/**
 * GET /api/health
 * Used by Docker healthcheck and load balancers to verify the frontend is alive.
 */
export function GET() {
    return NextResponse.json(
        { status: 'ok', timestamp: new Date().toISOString() },
        { status: 200 }
    )
}
