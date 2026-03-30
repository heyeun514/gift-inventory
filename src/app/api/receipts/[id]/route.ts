import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { readInventory } from '@/lib/db/inventory';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const receiptsDir = path.join(process.cwd(), 'data', 'receipts');

    const isOrder = id.endsWith('_order');
    const isReceipt = id.endsWith('_receipt');
    const itemId = id.replace(/_order$/, '').replace(/_receipt$/, '');

    const items = readInventory();
    const item = items.find((i) => i.id === itemId);

    let relativePath: string | undefined;
    if (isOrder) {
      relativePath = item?.orderSheetPath;
    } else if (isReceipt) {
      relativePath = item?.receiptPath;
    }

    // inventory에 경로가 있으면 해당 파일 반환
    if (relativePath) {
      const filePath = path.join(process.cwd(), 'data', relativePath);
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        const safeName = encodeURIComponent(path.basename(filePath));
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
          },
        });
      }
    }

    // fallback: receipts 디렉토리에서 id로 시작하는 파일 검색
    if (fs.existsSync(receiptsDir)) {
      const suffix = isOrder ? '_order.png' : isReceipt ? '_receipt.png' : '.png';
      const files = fs.readdirSync(receiptsDir);
      const match = files.find(
        (f) => f.startsWith(itemId) && f.endsWith(suffix),
      );
      if (match) {
        const filePath = path.join(receiptsDir, match);
        const fileBuffer = fs.readFileSync(filePath);
        const safeName = encodeURIComponent(match);
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
          },
        });
      }
    }

    return NextResponse.json(
      { error: '파일을 찾을 수 없습니다.' },
      { status: 404 },
    );
  } catch (error) {
    console.error('Receipt GET error:', error);
    return NextResponse.json(
      { error: '파일 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
