import { createClient } from 'redis';
import { GiftItem } from '@/types';

const KV_KEY = 'gift_inventory';

async function getRedis() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  return client;
}

export async function readInventoryKV(): Promise<GiftItem[]> {
  const redis = await getRedis();
  try {
    const data = await redis.get(KV_KEY);
    return data ? (JSON.parse(data) as GiftItem[]) : [];
  } finally {
    await redis.disconnect();
  }
}

export async function writeInventoryKV(items: GiftItem[]): Promise<void> {
  const redis = await getRedis();
  try {
    await redis.set(KV_KEY, JSON.stringify(items));
  } finally {
    await redis.disconnect();
  }
}

export async function giveItemsKV(
  id: string,
  recipients: { name: string; qty: number }[],
): Promise<GiftItem[] | null> {
  const redis = await getRedis();
  try {
    const data = await redis.get(KV_KEY);
    const items: GiftItem[] = data ? JSON.parse(data) : [];
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

    await redis.set(KV_KEY, JSON.stringify(items));
    return result;
  } finally {
    await redis.disconnect();
  }
}
