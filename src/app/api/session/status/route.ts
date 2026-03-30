import { NextResponse } from 'next/server';

export async function GET() {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json({ status: 'idle' });
  }

  try {
    const { getStatus } = await import('@/lib/browser/session-manager');
    return NextResponse.json({ status: getStatus() });
  } catch {
    return NextResponse.json({ status: 'idle' });
  }
}
