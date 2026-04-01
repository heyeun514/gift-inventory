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

function isNaverOrder(url: string): boolean {
  return url.includes('orders.pay.naver.com') || url.includes('pay.naver.com');
}

// ===== 29CM 주문 캡처 =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function capture29CM(page: any, detailUrl: string, items: CaptureItem[]): Promise<string[]> {
  const captured: string[] = [];

  // 1. 주문내역서
  await page.goto(detailUrl, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  const orderSheetBtn = await page.$('button:has-text("주문내역서 출력")');
  if (orderSheetBtn) {
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
      orderSheetBtn.click(),
    ]);
    const tp = popup || page;
    if (popup) await popup.waitForLoadState('load');
    await tp.waitForTimeout(3000);

    for (const item of items) {
      const fn = `${item.id}_${sanitizeFileName(item.itemName)}_order.png`;
      await tp.screenshot({ path: path.join(RECEIPTS_DIR, fn), fullPage: true, timeout: 60000 });
      updateDocPaths(item.id, { orderSheetPath: `receipts/${fn}` });
      captured.push(item.id);
    }
    if (popup) await popup.close();
  } else {
    for (const item of items) {
      const fn = `${item.id}_${sanitizeFileName(item.itemName)}_order.png`;
      await page.screenshot({ path: path.join(RECEIPTS_DIR, fn), fullPage: true, timeout: 60000 });
      updateDocPaths(item.id, { orderSheetPath: `receipts/${fn}` });
      captured.push(item.id);
    }
  }

  // 2. 영수증
  await page.goto(detailUrl, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  const receiptBtn = await page.$('button:has-text("영수증")');
  if (receiptBtn) {
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
      receiptBtn.click(),
    ]);
    const tp = popup || page;
    if (popup) await popup.waitForLoadState('load');
    await tp.waitForTimeout(3000);

    // 토스 인증 처리
    const needsAuth = await tp.evaluate(() => {
      const text = document.body.innerText || '';
      return text.includes('휴대폰번호') || text.includes('생년월일') || text.includes('본인인증');
    });

    if (needsAuth) {
      const tossPhone = process.env.TOSS_PHONE;
      const tossBirth = process.env.TOSS_BIRTH;
      if (tossPhone && tossBirth) {
        try {
          const inputs = await tp.$$('input');
          if (inputs.length >= 2) {
            await inputs[0].click(); await inputs[0].fill(tossPhone);
            await tp.waitForTimeout(500);
            await inputs[1].click(); await inputs[1].fill(tossBirth);
            await tp.waitForTimeout(500);
            const submitBtn = await tp.$('button[type="submit"], button:has-text("조회"), button:has-text("확인")');
            if (submitBtn) await submitBtn.click();
          }
        } catch { /* ignore */ }
      } else {
        console.log('토스 인증이 필요합니다. 브라우저에서 인증해주세요...');
      }
      try {
        await tp.waitForFunction(() => document.querySelectorAll('input').length === 0, { timeout: 300000, polling: 2000 });
        await tp.waitForTimeout(3000);
      } catch { /* timeout */ }
    }

    for (const item of items) {
      const fn = `${item.id}_${sanitizeFileName(item.itemName)}_receipt.png`;
      await tp.screenshot({ path: path.join(RECEIPTS_DIR, fn), fullPage: true, timeout: 60000 });
      updateDocPaths(item.id, { receiptPath: `receipts/${fn}` });
    }
    if (popup) await popup.close();
  }

  return captured;
}

// ===== 네이버 주문 캡처 =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function captureNaver(page: any, detailUrl: string, items: CaptureItem[]): Promise<string[]> {
  const captured: string[] = [];

  // 1. 주문상세 페이지 = 주문내역서 (fullPage 스크린샷)
  await page.goto(detailUrl, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  for (const item of items) {
    const fn = `${item.id}_${sanitizeFileName(item.itemName)}_order.png`;
    await page.screenshot({ path: path.join(RECEIPTS_DIR, fn), fullPage: true, timeout: 60000 });
    updateDocPaths(item.id, { orderSheetPath: `receipts/${fn}` });
    captured.push(item.id);
  }

  // 2. 영수증 버튼 클릭 → 새 탭(영수증 목록 페이지)
  const receiptBtn = await page.$('button:has-text("영수증")');
  if (!receiptBtn) return captured;

  const [receiptListTab] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
    receiptBtn.click(),
  ]);
  if (!receiptListTab) return captured;

  await receiptListTab.waitForLoadState('load');
  await receiptListTab.waitForTimeout(3000);

  // 3. "카드영수증 일괄 발급" 또는 개별 "카드영수증" 클릭
  //    둘 다 <a> 태그이며, 같은 탭에서 이동함 (새 탭 아님)
  const batchLink = await receiptListTab.$('a:has-text("카드영수증 일괄 발급")');
  const singleLink = batchLink
    ? null
    : await receiptListTab.$('a:has-text("카드영수증")');

  const targetLink = batchLink || singleLink;
  if (targetLink) {
    const linkText = await targetLink.textContent();
    console.log(`네이버 영수증: "${linkText?.trim()}" 클릭`);

    await targetLink.click();
    // 같은 탭에서 페이지 이동 → URL 변경 대기
    await receiptListTab.waitForURL(
      (url: URL) => url.toString().includes('receipts/integrated/card') || url.toString().includes('receipt/card'),
      { timeout: 15000 },
    ).catch(() => null);
    await receiptListTab.waitForLoadState('load');
    await receiptListTab.waitForTimeout(3000);

    // 매출전표 캡처
    for (const item of items) {
      const fn = `${item.id}_${sanitizeFileName(item.itemName)}_receipt.png`;
      await receiptListTab.screenshot({ path: path.join(RECEIPTS_DIR, fn), fullPage: true, timeout: 60000 });
      updateDocPaths(item.id, { receiptPath: `receipts/${fn}` });
    }
  }

  await receiptListTab.close();
  return captured;
}

// ===== 메인 라우트 =====
export async function POST(req: NextRequest) {
  if (process.env.DEPLOY_MODE === 'deployed') {
    return NextResponse.json({ error: '배포 환경에서는 사용할 수 없습니다.' }, { status: 403 });
  }

  try {
    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '캡처할 항목이 없습니다.' }, { status: 400 });
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
          const result = isNaverOrder(detailUrl)
            ? await captureNaver(page, detailUrl, captureItems)
            : await capture29CM(page, detailUrl, captureItems);
          allCaptured.push(...result);
        } catch (err) {
          console.error(`캡처 실패 (${detailUrl}):`, err);
        }
      }
      return allCaptured;
    });

    return NextResponse.json({ captured: captured.length, total: items.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '영수증 캡처 중 오류 발생';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
