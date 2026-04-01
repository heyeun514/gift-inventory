import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json(
      { error: '읽기 전용 모드에서는 사용할 수 없습니다.' },
      { status: 403 },
    );
  }

  try {
    const { getStatus } = await import('@/lib/browser/session-manager');
    const status = getStatus();
    if (status !== 'logged_in' && status !== 'busy') {
      return NextResponse.json(
        { error: '브라우저 세션이 없습니다. 먼저 로그인해주세요.' },
        { status: 400 },
      );
    }

    const { startDate, endDate, mall } = await req.json();
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: '시작일과 종료일을 입력해주세요.' },
        { status: 400 },
      );
    }

    let scraper;
    switch (mall || '29CM') {
      case '29CM': {
        const { TwentyNineCmScraper } = await import('@/lib/scraper/29cm');
        scraper = new TwentyNineCmScraper();
        break;
      }
      case 'NAVER': {
        const { NaverScraper } = await import('@/lib/scraper/naver');
        scraper = new NaverScraper();
        break;
      }
      default:
        return NextResponse.json(
          { error: `지원하지 않는 쇼핑몰: ${mall}` },
          { status: 400 },
        );
    }

    const items = await scraper.scrape(startDate, endDate);
    return NextResponse.json({ items });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : '스크래핑 중 오류 발생';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
