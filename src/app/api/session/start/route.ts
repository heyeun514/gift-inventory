import { NextResponse } from 'next/server';

export async function POST() {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json(
      { error: '읽기 전용 모드', status: 'idle' },
      { status: 403 },
    );
  }

  try {
    const { startSession, getStatus } = await import(
      '@/lib/browser/session-manager'
    );
    const status = getStatus();
    if (status === 'logged_in' || status === 'busy') {
      return NextResponse.json({ status, message: '이미 로그인되어 있습니다.' });
    }
    await startSession();
    return NextResponse.json({ status: getStatus() });
  } catch (error) {
    console.error('Session start error:', error);
    return NextResponse.json(
      { error: '세션 시작에 실패했습니다.', status: 'idle' },
      { status: 500 },
    );
  }
}
