import { NextResponse } from 'next/server';
import { writeInventory } from '@/lib/db/inventory';
import fs from 'fs';
import path from 'path';

export async function POST() {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json({ error: '읽기 전용 모드' }, { status: 403 });
  }
  try {
    // inventory 초기화
    writeInventory([]);

    // receipts 폴더 비우기
    const receiptsDir = path.join(process.cwd(), 'data', 'receipts');
    if (fs.existsSync(receiptsDir)) {
      for (const file of fs.readdirSync(receiptsDir)) {
        fs.unlinkSync(path.join(receiptsDir, file));
      }
    }

    return NextResponse.json({ message: '초기화 완료' });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json(
      { error: '초기화 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
