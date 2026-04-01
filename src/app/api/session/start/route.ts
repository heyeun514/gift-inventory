import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json(
      { error: '배포 환경에서는 사용할 수 없습니다.', status: 'idle' },
      { status: 403 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mall = body.mall || '29CM';

    const { startSession, getStatus, getSessionMall } = await import(
      '@/lib/browser/session-manager'
    );
    const status = getStatus();
    if ((status === 'logged_in' || status === 'busy') && getSessionMall() === mall) {
      return NextResponse.json({ status, message: '이미 로그인되어 있습니다.' });
    }
    await startSession(mall);
    return NextResponse.json({ status: getStatus(), mall });
  } catch (error) {
    console.error('Session start error:', error);
    return NextResponse.json(
      { error: '세션 시작에 실패했습니다.', status: 'idle' },
      { status: 500 },
    );
  }
}
