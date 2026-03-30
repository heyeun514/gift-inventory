import { GiftItem } from '@/types';

export interface ScraperModule {
  mallName: string;
  scrape(startDate: string, endDate: string): Promise<GiftItem[]>;
}
