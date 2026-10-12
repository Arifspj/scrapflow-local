import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json({
      ok: true,
      database: 'reachable',
    })
  } catch (error) {
    console.error('[v0] Database health check failed:', error)

    return NextResponse.json(
      {
        ok: false,
        database: 'unreachable',
        error: 'Database connection failed',
      },
      { status: 503 },
    )
  }
}
