import { NextRequest, NextResponse } from 'next/server';
import { updateItem } from '@/lib/db/inventory';

export async function PATCH(req: NextRequest) {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json({ error: '배포 환경에서는 사용할 수 없습니다.' }, { status: 403 });
  }
  try {
    const { id, price, quantity } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
    }
    const updated = updateItem(id, { price, quantity });
    if (!updated) {
      return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
