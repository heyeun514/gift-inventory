import { NextRequest, NextResponse } from 'next/server';
import { deleteItems } from '@/lib/db/inventory';

export async function POST(req: NextRequest) {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json({ error: '배포 환경에서는 사용할 수 없습니다.' }, { status: 403 });
  }
  try {
    const { ids } = await req.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '삭제할 항목이 없습니다.' }, { status: 400 });
    }
    const deleted = deleteItems(ids);
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
