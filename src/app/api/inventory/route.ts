import { NextRequest, NextResponse } from 'next/server';
import { readInventory, addItems } from '@/lib/db/inventory';

const isDeployed = process.env.DEPLOY_MODE === 'deployed';

export async function GET() {
  if (isDeployed) {
    const { readInventoryKV } = await import('@/lib/db/kv-inventory');
    const items = await readInventoryKV();
    return NextResponse.json({ items });
  }

  const items = readInventory();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  if (isDeployed) {
    return NextResponse.json({ error: '배포 환경에서는 사용할 수 없습니다.' }, { status: 403 });
  }
  try {
    const { items } = await req.json();

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: '저장할 항목이 없습니다.' },
        { status: 400 },
      );
    }

    const result = addItems(items);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json(
      { error: '저장 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
