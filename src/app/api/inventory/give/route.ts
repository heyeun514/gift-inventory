import { NextRequest, NextResponse } from 'next/server';
import { giveItems } from '@/lib/db/inventory';

const isDeployed = process.env.DEPLOY_MODE === 'deployed';

export async function PATCH(req: NextRequest) {
  try {
    const { id, recipients } = await req.json();

    if (!id || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'ID와 받는 사람 정보가 필요합니다.' },
        { status: 400 },
      );
    }

    let result;
    if (isDeployed) {
      const { giveItemsKV } = await import('@/lib/db/kv-inventory');
      result = await giveItemsKV(id, recipients);
    } else {
      result = giveItems(id, recipients);
    }

    if (!result) {
      return NextResponse.json(
        { error: '해당 항목을 찾을 수 없습니다.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ items: result });
  } catch (error) {
    console.error('Give error:', error);
    return NextResponse.json(
      { error: '상태 업데이트 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
