import { NextResponse } from 'next/server';
import { checkInactivityAndSendReminders } from '@/lib/bot/agent';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await checkInactivityAndSendReminders();
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      stats,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error checking inactivity' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
