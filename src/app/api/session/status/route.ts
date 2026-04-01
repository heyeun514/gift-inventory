import { NextResponse } from 'next/server';

export async function GET() {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json({ status: 'idle', mall: null });
  }

  try {
    const { getStatus, getSessionMall } = await import('@/lib/browser/session-manager');
    return NextResponse.json({ status: getStatus(), mall: getSessionMall() });
  } catch {
    return NextResponse.json({ status: 'idle', mall: null });
  }
}
