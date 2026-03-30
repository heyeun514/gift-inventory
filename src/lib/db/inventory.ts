import fs from 'fs';
import path from 'path';
import { GiftItem } from '@/types';

const DATA_PATH = path.join(process.cwd(), 'data', 'inventory.json');

export function readInventory(): GiftItem[] {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, '[]', 'utf-8');
    return [];
  }
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw) as GiftItem[];
}

export function writeInventory(items: GiftItem[]): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(items, null, 2), 'utf-8');
}

export function addItems(newItems: GiftItem[]): { added: number; skipped: number } {
  const existing = readInventory();
  const existingIds = new Set(existing.map((item) => item.id));

  let added = 0;
  let skipped = 0;

  for (const item of newItems) {
    if (existingIds.has(item.id)) {
      skipped++;
    } else {
      existing.push(item);
      existingIds.add(item.id);
      added++;
    }
  }

  writeInventory(existing);
  return { added, skipped };
}

export function updateDocPaths(
  id: string,
  paths: { orderSheetPath?: string; receiptPath?: string },
): void {
  const items = readInventory();
  const item = items.find((i) => i.id === id);
  if (item) {
    if (paths.orderSheetPath) item.orderSheetPath = paths.orderSheetPath;
    if (paths.receiptPath) item.receiptPath = paths.receiptPath;
    writeInventory(items);
  }
}

export function giveItems(
  id: string,
  recipients: { name: string; qty: number }[],
): GiftItem[] | null {
  const items = readInventory();
  const item = items.find((i) => i.id === id);
  if (!item) return null;

  const totalGiveQty = recipients.reduce((sum, r) => sum + r.qty, 0);
  const currentQty = item.quantity ?? 1;
  const today = new Date().toISOString().split('T')[0];
  const result: GiftItem[] = [];

  if (totalGiveQty >= currentQty) {
    // 전량 선물: 원래 아이템을 첫 번째 수령인으로
    item.status = 'GIVEN';
    item.recipientName = recipients[0].name;
    item.givenDate = today;
    item.quantity = recipients[0].qty;
    result.push(item);

    // 추가 수령인이 있으면 새 아이템 생성
    for (let i = 1; i < recipients.length; i++) {
      const newItem: GiftItem = {
        ...item,
        id: `${id}_g${i}`,
        status: 'GIVEN',
        recipientName: recipients[i].name,
        givenDate: today,
        quantity: recipients[i].qty,
      };
      items.push(newItem);
      result.push(newItem);
    }
  } else {
    // 부분 선물: 원래 아이템의 수량 감소
    item.quantity = currentQty - totalGiveQty;

    // 각 수령인별로 GIVEN 아이템 생성
    for (let i = 0; i < recipients.length; i++) {
      const newItem: GiftItem = {
        ...item,
        id: `${id}_g${i}`,
        status: 'GIVEN',
        recipientName: recipients[i].name,
        givenDate: today,
        quantity: recipients[i].qty,
      };
      items.push(newItem);
      result.push(newItem);
    }
  }

  writeInventory(items);
  return result;
}
