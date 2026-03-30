import { NextResponse } from 'next/server';

export async function POST() {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json({ status: 'idle' });
  }

  try {
    const { closeSession } = await import('@/lib/browser/session-manager');
    await closeSession();
  } catch { /* ignore */ }
  return NextResponse.json({ status: 'idle' });
}
