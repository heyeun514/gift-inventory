import { Page } from 'playwright';
import { GiftItem } from '@/types';
import { ScraperModule } from './base';
import { enqueueTask } from '@/lib/browser/session-manager';

const ORDER_LIST_URL = 'https://www.29cm.co.kr/order/my-order/list';

export class TwentyNineCmScraper implements ScraperModule {
  mallName = '29CM';

  async scrape(startDate: string, endDate: string): Promise<GiftItem[]> {
    return enqueueTask(async (page: Page) => {
      await page.goto(ORDER_LIST_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      const allItems: GiftItem[] = [];

      while (true) {
        const pageItems = await scrapeOrderPage(page);
        allItems.push(...pageItems);

        const lastItem = pageItems[pageItems.length - 1];
        if (lastItem && lastItem.orderDate < startDate) break;

        // 다음 페이지 탐색
        const paginationButtons = await page.$$eval('button', (btns) =>
          btns
            .filter((b) => /^\d+$/.test(b.textContent?.trim() || ''))
            .map((b) => ({
              text: b.textContent?.trim() || '',
              isCurrent:
                b.getAttribute('aria-current') === 'page' || b.disabled,
            })),
        );

        const currentBtn = paginationButtons.find((b) => b.isCurrent);
        const nextBtn = currentBtn
          ? paginationButtons.find(
              (b) =>
                !b.isCurrent && Number(b.text) > Number(currentBtn.text),
            )
          : null;

        if (!nextBtn) break;

        await page.click(`button:has-text("${nextBtn.text}")`);
        await page.waitForTimeout(2000);
        await page.waitForLoadState('networkidle');
      }

      return allItems.filter(
        (item) => item.orderDate >= startDate && item.orderDate <= endDate,
      );
    });
  }
}

async function scrapeOrderPage(page: Page): Promise<GiftItem[]> {
  return await page.evaluate(() => {
    const items: {
      id: string;
      mall: string;
      orderDate: string;
      itemName: string;
      price: number;
      quantity: number;
      imageUrl?: string;
      status: 'AVAILABLE';
      detailUrl?: string;
    }[] = [];

    function parseDateText(dateText: string): string {
      const match = dateText.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
      if (!match) return '';
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    function parsePriceText(text: string): number {
      const match = text.match(/([\d,]+)원/);
      if (!match) return 0;
      return parseInt(match[1].replace(/,/g, ''), 10) || 0;
    }

    function parseQuantity(text: string): number {
      const match = text.match(/수량\s*(\d+)/);
      return match ? parseInt(match[1], 10) : 1;
    }

    let orderLis = document.querySelectorAll('ol > li.e1koz66l0');
    if (orderLis.length === 0) {
      orderLis = document.querySelectorAll(
        'ol > li:has(a[href*="/order/my-order/detail/"])',
      );
    }

    for (const orderLi of orderLis) {
      const dateEl = orderLi.querySelector(
        '.flex.items-center.gap-4 span:nth-child(2)',
      );
      const orderDate = parseDateText(dateEl?.textContent?.trim() || '');

      const detailLink = orderLi.querySelector(
        'a[href*="/order/my-order/detail/"]',
      ) as HTMLAnchorElement | null;
      const detailHref = detailLink?.href || '';
      const orderNumber = detailHref.match(/detail\/(\d+)/)?.[1] || '';

      const productImgs = orderLi.querySelectorAll(
        'img.h-full.w-full.object-contain',
      );

      let productIdx = 0;
      for (const img of productImgs) {
        const itemName = img.getAttribute('alt') || '';
        const imageUrl = img.getAttribute('src') || '';
        if (!itemName) continue;

        // 상품별 취소 상태 확인
        let productContainer: Element | null | undefined =
          img.parentElement?.parentElement;
        let searchEl: Element | null = img;
        for (let d = 0; d < 5 && searchEl; d++) {
          searchEl = searchEl.parentElement;
          if (!searchEl) break;
          const tag = searchEl.tagName;
          const cls = (searchEl as HTMLElement).className?.toString() || '';
          if ((tag === 'A' && cls.includes('flex-1')) || tag === 'LI') {
            productContainer = searchEl;
            break;
          }
        }

        const containerText = productContainer?.textContent || '';
        if (containerText.includes('취소완료')) continue;

        const brandEl = productContainer?.querySelector(
          'p.text-s-bold.text-primary',
        );
        const brandName = brandEl?.textContent?.trim() || '';
        const priceEl = productContainer?.querySelector(
          'p.mt-4.text-m.text-secondary',
        );
        const priceText = priceEl?.textContent?.trim() || '0';
        const totalPrice = parsePriceText(priceText);
        const quantity = parseQuantity(priceText);
        const price = quantity > 1 ? Math.round(totalPrice / quantity) : totalPrice;

        const id = `29CM_${orderNumber}_${productIdx}`;
        productIdx++;

        items.push({
          id,
          mall: '29CM',
          orderDate,
          itemName: brandName ? `[${brandName}] ${itemName}` : itemName,
          price,
          quantity,
          imageUrl: imageUrl || undefined,
          status: 'AVAILABLE',
          detailUrl: detailHref || undefined,
        });
      }
    }

    return items;
  }) as GiftItem[];
}
