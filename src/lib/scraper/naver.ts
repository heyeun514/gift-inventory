import { Page } from 'playwright';
import { GiftItem } from '@/types';
import { ScraperModule } from './base';
import { enqueueTask } from '@/lib/browser/session-manager';

const ORDER_LIST_URL = 'https://pay.naver.com/pc/history?serviceChannel=SHOPPING';

export class NaverScraper implements ScraperModule {
  mallName = 'NAVER';

  async scrape(startDate: string, endDate: string): Promise<GiftItem[]> {
    return enqueueTask(async (page: Page) => {
      await page.goto(ORDER_LIST_URL, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(5000);

      // 쇼핑 탭 클릭
      const shoppingTab = await page.$('button:has-text("쇼핑")');
      if (shoppingTab) {
        await shoppingTab.click();
        await page.waitForTimeout(3000);
      }

      // 1단계: 주문 목록에서 주문상세 URL + 날짜 수집
      const allOrders: { detailUrl: string; orderDate: string }[] = [];
      let pageNum = 1;

      while (true) {
        const orders = await extractOrderLinks(page);
        allOrders.push(...orders);

        // 마지막 주문 날짜가 시작일보다 이전이면 중단
        const lastOrder = orders[orders.length - 1];
        if (lastOrder && lastOrder.orderDate < startDate) break;
        if (orders.length === 0) break;

        // 다음 페이지
        pageNum++;
        const nextBtn = await page.$(
          `button:has-text("${pageNum} 페이지"), a:has-text("다음 페이지")`,
        );
        if (!nextBtn) break;
        await nextBtn.click();
        await page.waitForTimeout(3000);
        await page.waitForLoadState('load');
      }

      // 날짜 범위 필터링
      const filteredOrders = allOrders.filter(
        (o) => o.orderDate >= startDate && o.orderDate <= endDate,
      );

      // 2단계: 각 주문 상세 페이지에서 개별 상품 추출
      const allItems: GiftItem[] = [];
      for (const order of filteredOrders) {
        try {
          const items = await extractProductsFromDetail(page, order.detailUrl, order.orderDate);
          allItems.push(...items);
        } catch (err) {
          console.error(`상세 페이지 파싱 실패 (${order.detailUrl}):`, err);
        }
      }

      return allItems;
    });
  }
}

// 주문 목록에서 주문상세 URL + 날짜 추출
async function extractOrderLinks(page: Page): Promise<{ detailUrl: string; orderDate: string }[]> {
  return await page.evaluate(() => {
    const results: { detailUrl: string; orderDate: string }[] = [];
    const seenUrls = new Set<string>();
    const links = document.querySelectorAll('a[href*="orders.pay.naver.com/order/status"]');

    for (const link of links) {
      const href = (link as HTMLAnchorElement).href || '';
      if (seenUrls.has(href)) continue;
      seenUrls.add(href);

      // 주문 블록에서 날짜 추출
      let container = link.parentElement;
      for (let d = 0; d < 15 && container; d++) {
        const text = container.textContent || '';
        if (text.includes('결제일시') && text.includes('원')) break;
        container = container.parentElement;
      }

      const blockText = container?.textContent || '';

      // 취소 주문 건너뛰기
      if (blockText.includes('취소완료')) continue;

      // 날짜 추출
      const dateMatch = blockText.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*\d{1,2}:\d{2}\s*결제/);
      let orderDate = '';
      if (dateMatch) {
        const year = new Date().getFullYear();
        orderDate = `${year}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`;
      }

      if (orderDate) {
        results.push({ detailUrl: href, orderDate });
      }
    }

    return results;
  });
}

// 주문 상세 페이지에서 개별 상품 추출
async function extractProductsFromDetail(
  page: Page,
  detailUrl: string,
  orderDate: string,
): Promise<GiftItem[]> {
  await page.goto(detailUrl, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  const orderNumber = detailUrl.match(/status\/(\d+)/)?.[1] || '';

  return await page.evaluate(
    ({ orderNumber, orderDate, detailUrl }) => {
      const items: {
        id: string;
        mall: string;
        orderDate: string;
        itemName: string;
        price: number;
        quantity: number;
        imageUrl?: string;
        status: 'AVAILABLE';
        detailUrl: string;
      }[] = [];

      // 상세 페이지에서 "상품명" 라벨 다음에 상품명이 옴
      // 구조: 상품명 → 옵션 → 상품가격
      const bodyText = document.body.innerText || '';
      const sections = bodyText.split('상품명\n');

      for (let i = 1; i < sections.length; i++) {
        const section = sections[i];
        const lines = section.split('\n').map(l => l.trim()).filter(l => l);

        // 첫 줄 = 상품명
        const itemName = lines[0] || '';
        if (!itemName) continue;

        // 옵션에서 수량 추출: "제품선택: ... 2개" 또는 단순히 "1개"
        let quantity = 1;
        const optionLine = lines.find(l => l.startsWith('옵션') || l.includes('제품선택'));
        if (optionLine) {
          // "제품선택: XXX 2개" 에서 수량 추출
          const qtyMatch = optionLine.match(/(\d+)개\s*$/);
          if (qtyMatch) quantity = parseInt(qtyMatch[1], 10);
        } else {
          // 옵션 라벨 없이 바로 "... N개" 패턴
          for (const line of lines.slice(1, 5)) {
            const qtyMatch = line.match(/(\d+)개\s*$/);
            if (qtyMatch) {
              quantity = parseInt(qtyMatch[1], 10);
              break;
            }
          }
        }

        // 가격 추출: "상품가격" 다음 줄 또는 "원" 포함 패턴
        let price = 0;
        for (const line of lines.slice(1, 8)) {
          // "39,900원61,900" 또는 "39,900원" 패턴
          const priceMatch = line.match(/^([\d,]+)원/);
          if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/,/g, ''), 10) || 0;
            break;
          }
        }

        // 개당 가격
        const unitPrice = quantity > 1 ? Math.round(price / quantity) : price;

        // 이미지: 상품 근처의 img
        // (evaluate 내에서는 위치 기반으로 찾기 어려우므로 생략)

        const id = `NAVER_${orderNumber}_${i - 1}`;

        items.push({
          id,
          mall: 'NAVER',
          orderDate,
          itemName,
          price: unitPrice,
          quantity,
          imageUrl: undefined,
          status: 'AVAILABLE',
          detailUrl,
        });
      }

      return items;
    },
    { orderNumber, orderDate, detailUrl },
  ) as GiftItem[];
}
