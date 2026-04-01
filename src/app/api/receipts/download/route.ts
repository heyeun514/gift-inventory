import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { readInventory } from '@/lib/db/inventory';

export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '다운로드할 항목이 없습니다.' }, { status: 400 });
    }

    const items = readInventory();
    const zip = new JSZip();
    let fileCount = 0;

    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;

      for (const [label, relPath] of [
        ['주문내역서', item.orderSheetPath],
        ['영수증', item.receiptPath],
      ] as const) {
        if (!relPath) continue;
        const filePath = path.join(process.cwd(), 'data', relPath);
        if (!fs.existsSync(filePath)) continue;

        const fileName = `${item.itemName.slice(0, 30)}_${label}.png`;
        zip.file(fileName, fs.readFileSync(filePath));
        fileCount++;
      }
    }

    if (fileCount === 0) {
      return NextResponse.json({ error: '다운로드할 증빙서류가 없습니다.' }, { status: 404 });
    }

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`증빙서류_${today}.zip`)}`,
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: '다운로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
