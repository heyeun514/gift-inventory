import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { updateDocPaths } from '@/lib/db/inventory';

const RECEIPTS_DIR = path.join(process.cwd(), 'data', 'receipts');

interface CaptureItem {
  id: string;
  itemName: string;
  detailUrl: string;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/^\[.*?\]\s*/, '')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 30);
}

export async function POST(req: NextRequest) {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json(
      { error: '읽기 전용 모드에서는 사용할 수 없습니다.' },
      { status: 403 },
    );
  }

  try {
    const { items } = await req.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: '캡처할 항목이 없습니다.' },
        { status: 400 },
      );
    }

    if (!fs.existsSync(RECEIPTS_DIR)) {
      fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
    }

    const detailUrls = new Map<string, CaptureItem[]>();
    for (const item of items) {
      if (item.detailUrl) {
        const group = detailUrls.get(item.detailUrl) || [];
        group.push({ id: item.id, itemName: item.itemName, detailUrl: item.detailUrl });
        detailUrls.set(item.detailUrl, group);
      }
    }

    const { enqueueTask } = await import('@/lib/browser/session-manager');

    const captured = await enqueueTask(async (page) => {
      const allCaptured: string[] = [];

      for (const [detailUrl, captureItems] of detailUrls) {
        try {
          const result = await captureOrderDetail(page, detailUrl, captureItems);
          allCaptured.push(...result);
        } catch (err) {
          console.error(`캡처 실패 (${detailUrl}):`, err);
        }
      }

      return allCaptured;
    });

    return NextResponse.json({
      captured: captured.length,
      total: items.length,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : '영수증 캡처 중 오류 발생';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function captureOrderDetail(
  page: any,
  detailUrl: string,
  items: CaptureItem[],
): Promise<string[]> {
  const captured: string[] = [];

  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 1. 주문내역서 출력
  const orderSheetBtn = await page.$('button:has-text("주문내역서 출력")');

  if (orderSheetBtn) {
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
      orderSheetBtn.click(),
    ]);

    const targetPage = popup || page;
    if (popup) {
      await popup.waitForLoadState('load');
      await popup.waitForTimeout(3000);
    } else {
      await page.waitForTimeout(3000);
    }

    for (const item of items) {
      const safeName = sanitizeFileName(item.itemName);
      const fileName = `${item.id}_${safeName}_order.png`;
      const filePath = path.join(RECEIPTS_DIR, fileName);
      await targetPage.screenshot({ path: filePath, fullPage: true });
      updateDocPaths(item.id, { orderSheetPath: `receipts/${fileName}` });
      captured.push(item.id);
    }

    if (popup) await popup.close();
  } else {
    for (const item of items) {
      const safeName = sanitizeFileName(item.itemName);
      const fileName = `${item.id}_${safeName}_order.png`;
      const filePath = path.join(RECEIPTS_DIR, fileName);
      await page.screenshot({ path: filePath, fullPage: true });
      updateDocPaths(item.id, { orderSheetPath: `receipts/${fileName}` });
      captured.push(item.id);
    }
  }

  // 2. 영수증 출력
  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const receiptBtn = await page.$('button:has-text("영수증 출력")');

  if (receiptBtn) {
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
      receiptBtn.click(),
    ]);

    const targetPage = popup || page;
    if (popup) {
      await popup.waitForLoadState('load');
    }
    await targetPage.waitForTimeout(3000);

    const needsAuth = await targetPage.evaluate(() => {
      const text = document.body.innerText || '';
      return (
        text.includes('휴대폰번호') ||
        text.includes('생년월일') ||
        text.includes('본인인증') ||
        text.includes('로그인')
      );
    });

    if (needsAuth) {
      const tossPhone = process.env.TOSS_PHONE;
      const tossBirth = process.env.TOSS_BIRTH;

      if (tossPhone && tossBirth) {
        console.log('토스 인증 자동 입력 중...');
        try {
          const inputs = await targetPage.$$('input');
          if (inputs.length >= 2) {
            await inputs[0].click();
            await inputs[0].fill(tossPhone);
            await targetPage.waitForTimeout(500);
            await inputs[1].click();
            await inputs[1].fill(tossBirth);
            await targetPage.waitForTimeout(500);
            const submitBtn = await targetPage.$(
              'button[type="submit"], button:has-text("조회"), button:has-text("확인")',
            );
            if (submitBtn) {
              await submitBtn.click();
              await targetPage.waitForTimeout(3000);
            }
          }
        } catch (e) {
          console.log('자동 입력 실패, 수동 인증 대기:', e);
        }
      } else {
        console.log('영수증 조회를 위해 추가 인증이 필요합니다. 브라우저에서 인증해주세요...');
      }

      try {
        await targetPage.waitForFunction(
          () => document.querySelectorAll('input').length === 0,
          { timeout: 300000, polling: 2000 },
        );
        await targetPage.waitForTimeout(3000);
      } catch {
        console.log('영수증 인증 대기 타임아웃');
      }
    }

    for (const item of items) {
      const safeName = sanitizeFileName(item.itemName);
      const fileName = `${item.id}_${safeName}_receipt.png`;
      const filePath = path.join(RECEIPTS_DIR, fileName);
      await targetPage.screenshot({ path: filePath, fullPage: true });
      updateDocPaths(item.id, { receiptPath: `receipts/${fileName}` });
    }

    if (popup) await popup.close();
  }

  return captured;
}
