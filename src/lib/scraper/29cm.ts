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
      await page.waitForTimeout(3000);

      // 기간 필터 선택 시도
      await selectPeriodFilter(page);

      const allItems: GiftItem[] = [];

      while (true) {
        const pageItems = await scrapeOrderPage(page);
        allItems.push(...pageItems);

        // 유효한 날짜 항목 기준으로 종료 판단
        const validItems = pageItems.filter((item) => item.orderDate);
        const lastValidItem = validItems[validItems.length - 1];
        if (
          lastValidItem &&
          lastValidItem.orderDate &&
          lastValidItem.orderDate < startDate
        )
          break;

        // 다음 페이지 이동
        const paginationButtons = await page.$$eval('button, a', (btns) =>
          btns
            .filter((b) => /^\d+$/.test(b.textContent?.trim() || ''))
            .map((b) => ({
              text: b.textContent?.trim() || '',
              isCurrent:
                b.getAttribute('aria-current') === 'page' ||
                b.getAttribute('aria-current') === 'true' ||
                b.classList.contains('active') ||
                (b as HTMLButtonElement).disabled,
            })),
        );

        const currentBtn = paginationButtons.find((b) => b.isCurrent);
        const nextBtn = currentBtn
          ? paginationButtons.find(
              (b) => !b.isCurrent && Number(b.text) > Number(currentBtn.text),
            )
          : null;

        if (!nextBtn) break;

        const nextEl = page
          .locator(
            `button:has-text("${nextBtn.text}"), a:has-text("${nextBtn.text}")`,
          )
          .first();
        if (await nextEl.isVisible().catch(() => false)) {
          await nextEl.click();
          await page.waitForTimeout(2500);
          await page.waitForLoadState('networkidle').catch(() => {});
        } else {
          break;
        }
      }

      return allItems.filter(
        (item) => item.orderDate >= startDate && item.orderDate <= endDate,
      );
    });
  }
}

async function scrapeOrderPage(page: Page): Promise<GiftItem[]> {
  return await page.evaluate(() => {
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
      const match = text.match(/수량\s*(\d+)개?/);
      return match ? parseInt(match[1], 10) : 1;
    }

    // 1. 주문 상세 페이지 링크들 탐색
    const detailLinks = Array.from(
      document.querySelectorAll('a[href*="/order/my-order/detail/"]'),
    ) as HTMLAnchorElement[];

    // 2. 주문번호별 카드 그룹화 (중복 방지 및 상위 카드 추출)
    const orderGroups = new Map<
      string,
      { orderNum: string; detailHref: string; card: Element }
    >();

    detailLinks.forEach((link) => {
      const href = link.href || link.getAttribute('href') || '';
      const orderNum = href.match(/detail\/(\d+)/)?.[1];
      if (!orderNum) return;

      let card: Element | null = link.parentElement;
      for (let i = 0; i < 8 && card; i++) {
        const tag = card.tagName;
        const cls = (card.className || '').toString();
        if (
          tag === 'LI' ||
          tag === 'ARTICLE' ||
          tag === 'SECTION' ||
          cls.includes('e1koz66l0')
        )
          break;
        card = card.parentElement;
      }
      if (!card)
        card = link.parentElement ? link.parentElement.parentElement || link : link;

      if (!orderGroups.has(orderNum)) {
        orderGroups.set(orderNum, { orderNum, detailHref: href, card });
      }
    });

    const resultItems: {
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

    // 3. 각 주문 카드별 상품 데이터 파싱
    orderGroups.forEach(({ orderNum, detailHref, card }) => {
      const cardText = card.textContent || '';
      const orderDate = parseDateText(cardText);

      // 주문 카드 내 상품 이미지들
      const productImgs = Array.from(card.querySelectorAll('img')).filter(
        (img) => {
          const alt = (img.getAttribute('alt') || '').trim();
          const src = (img.getAttribute('src') || '').trim();
          return (
            alt.length > 0 &&
            alt !== '29CM' &&
            !alt.includes('프로필') &&
            !alt.includes('로고') &&
            (src.includes('29cm') ||
              src.includes('item') ||
              src.includes('next-product'))
          );
        },
      );

      let productIdx = 0;
      productImgs.forEach((img) => {
        const itemName = (img.getAttribute('alt') || '').trim();
        const imageUrl = (img.getAttribute('src') || '').trim();

        // img 상위 상품 박스 찾기
        let productBox: Element | null = img.parentElement;
        for (let i = 0; i < 5 && productBox; i++) {
          const text = productBox.textContent || '';
          if (
            text.includes('원') &&
            (text.includes('수량') || text.includes('개') || text.includes('배송'))
          )
            break;
          productBox = productBox.parentElement;
        }

        const boxText = productBox ? productBox.textContent || '' : cardText;
        if (boxText.includes('취소완료')) return;

        // 리프(Leaf) 가격 전용 요소 탐색 (자식 요소가 없는 순수 가격 텍스트 노드에서 가격 파싱)
        let priceText = '';
        if (productBox) {
          const allLeaves = Array.from(
            productBox.querySelectorAll('p, span, div'),
          ).filter(
            (el) =>
              el.children.length === 0 && (el.textContent || '').includes('원'),
          );
          const priceLeaf =
            allLeaves.find((el) => (el.textContent || '').includes('수량')) ||
            allLeaves[allLeaves.length - 1];
          if (priceLeaf) priceText = priceLeaf.textContent || '';
        }
        if (!priceText) priceText = boxText;

        const totalPrice = parsePriceText(priceText);
        const quantity = parseQuantity(priceText);
        const price =
          quantity > 1 ? Math.round(totalPrice / quantity) : totalPrice;

        // 브랜드 추출
        let brandName = '';
        if (productBox) {
          const brandP = productBox.querySelector(
            'p.text-s-bold, p.text-primary, span.brand, .brand',
          );
          if (brandP) brandName = brandP.textContent?.trim() || '';
        }

        resultItems.push({
          id: `29CM_${orderNum}_${productIdx++}`,
          mall: '29CM',
          orderDate,
          itemName: brandName ? `[${brandName}] ${itemName}` : itemName,
          price,
          quantity,
          imageUrl: imageUrl || undefined,
          status: 'AVAILABLE',
          detailUrl: detailHref,
        });
      });
    });

    return resultItems;
  }) as GiftItem[];
}

async function selectPeriodFilter(page: Page): Promise<void> {
  try {
    await page.waitForTimeout(2000);

    const dropdownButton = page
      .locator('button')
      .filter({ hasText: /최근|개월|년/ })
      .first();

    if (await dropdownButton.isVisible({ timeout: 1500 }).catch(() => false)) {
      await dropdownButton.click();
      await page.waitForTimeout(1000);

      const oneYearOption = page
        .locator('button, li, div, a, [role="option"]')
        .filter({ hasText: /^1년$|^최근\s*1년$/ })
        .first();

      if (await oneYearOption.isVisible({ timeout: 1500 }).catch(() => false)) {
        await oneYearOption.click();
        console.log('[29CM Scraper] "1년" 옵션을 클릭했습니다.');
        await page.waitForTimeout(3000);
        await page.waitForLoadState('networkidle').catch(() => {});
        return;
      }
    }

    console.log('[29CM Scraper] 기간 드롭다운 미선택 (기본 조회 상태로 진행)');
  } catch (error) {
    console.warn('[29CM Scraper] 기간 선택 중 오류:', error);
  }
}
