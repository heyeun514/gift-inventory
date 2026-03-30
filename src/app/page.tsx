'use client';

import { useState, useEffect, useCallback } from 'react';
import { GiftItem } from '@/types';
import GiftTable from '@/components/GiftTable';
import GiveModal from '@/components/GiveModal';

export default function Home() {
  const [inventory, setInventory] = useState<GiftItem[]>([]);
  const [giveTargetId, setGiveTargetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'available' | 'given'>('available');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchInventory = useCallback(async () => {
    const res = await fetch('/api/inventory');
    const data = await res.json();
    setInventory(data.items || []);
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleGive = async (recipients: { name: string; qty: number }[]) => {
    if (!giveTargetId) return;
    try {
      const res = await fetch('/api/inventory/give', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: giveTargetId, recipients }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error });
        return;
      }
      const names = recipients.map((r) => r.name).join(', ');
      setMessage({ type: 'success', text: `${names}님에게 선물 완료!` });
      await fetchInventory();
    } catch {
      setMessage({ type: 'error', text: '상태 업데이트에 실패했습니다.' });
    } finally {
      setGiveTargetId(null);
    }
  };

  const availableItems = inventory.filter((i) => i.status === 'AVAILABLE');
  const givenItems = inventory.filter((i) => i.status === 'GIVEN');

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Gift Inventory
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            선물 보관함
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {message && (
          <div
            className={`p-4 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div>
          <div className="flex border-b border-gray-200 mb-0">
            <button
              onClick={() => setActiveTab('available')}
              className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px ${
                activeTab === 'available'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              보유한 선물 ({availableItems.length})
            </button>
            <button
              onClick={() => setActiveTab('given')}
              className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px ${
                activeTab === 'given'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              제공한 선물 ({givenItems.length})
            </button>
          </div>
          {activeTab === 'available' ? (
            <GiftTable
              title="보유한 선물 리스트"
              items={availableItems}
              showGiveButton
              onGive={(id) => setGiveTargetId(id)}
            />
          ) : (
            <GiftTable title="제공한 선물 리스트" items={givenItems} />
          )}
        </div>
      </main>

      {giveTargetId && (() => {
        const target = inventory.find((i) => i.id === giveTargetId);
        return (
          <GiveModal
            quantity={target?.quantity ?? 1}
            itemName={target?.itemName ?? ''}
            onConfirm={handleGive}
            onCancel={() => setGiveTargetId(null)}
          />
        );
      })()}
    </div>
  );
}
