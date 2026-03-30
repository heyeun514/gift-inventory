import { kv } from '@vercel/kv';
import { GiftItem } from '@/types';

const KV_KEY = 'gift_inventory';

export async function readInventoryKV(): Promise<GiftItem[]> {
  const items = await kv.get<GiftItem[]>(KV_KEY);
  return items || [];
}

export async function writeInventoryKV(items: GiftItem[]): Promise<void> {
  await kv.set(KV_KEY, items);
}

export async function giveItemsKV(
  id: string,
  recipients: { name: string; qty: number }[],
): Promise<GiftItem[] | null> {
  const items = await readInventoryKV();
  const item = items.find((i) => i.id === id);
  if (!item) return null;

  const totalGiveQty = recipients.reduce((sum, r) => sum + r.qty, 0);
  const currentQty = item.quantity ?? 1;
  const today = new Date().toISOString().split('T')[0];
  const result: GiftItem[] = [];

  if (totalGiveQty >= currentQty) {
    item.status = 'GIVEN';
    item.recipientName = recipients[0].name;
    item.givenDate = today;
    item.quantity = recipients[0].qty;
    result.push(item);

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
    item.quantity = currentQty - totalGiveQty;

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

  await writeInventoryKV(items);
  return result;
}
