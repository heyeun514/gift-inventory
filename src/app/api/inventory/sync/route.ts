import { NextResponse } from 'next/server';
import { readInventory } from '@/lib/db/inventory';

export async function POST() {
  try {
    const { writeInventoryKV } = await import('@/lib/db/kv-inventory');
    const items = readInventory();
    await writeInventoryKV(items);
    return NextResponse.json({ synced: items.length });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'KV 동기화 실패' },
      { status: 500 },
    );
  }
}
