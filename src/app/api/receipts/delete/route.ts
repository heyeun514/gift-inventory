import { NextRequest, NextResponse } from 'next/server';
import { deleteReceipts } from '@/lib/db/inventory';

export async function POST(req: NextRequest) {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json({ error: '배포 환경에서는 사용할 수 없습니다.' }, { status: 403 });
  }
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
    }
    const deleted = deleteReceipts(id);
    if (!deleted) {
      return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Receipt delete error:', error);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
