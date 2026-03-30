export type GiftStatus = 'AVAILABLE' | 'GIVEN';

export interface GiftItem {
  id: string;
  mall: string;
  orderDate: string;
  itemName: string;
  price: number;
  quantity?: number;
  imageUrl?: string;
  status: GiftStatus;
  recipientName?: string;
  givenDate?: string;
  orderSheetPath?: string;
  receiptPath?: string;
  detailUrl?: string;
}
