'use client';

import { useState, useMemo } from 'react';
import { GiftItem } from '@/types';

interface GiftTableProps {
  title: string;
  items: GiftItem[];
  showGiveButton?: boolean;
  showDeleteButton?: boolean;
  editable?: boolean;
  onGive?: (id: string) => void;
  onDeleteMultiple?: (ids: string[]) => void;
  onUpdate?: (id: string, updates: { price?: number; quantity?: number }) => void;
  onDeleteReceipts?: (id: string) => void;
}

type SortKey = 'orderDate' | 'price';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline ml-1 ${active ? 'text-blue-600' : 'text-gray-400'}`}
    >
      <path
        d="M12 5l-5 5h10z"
        fill={active && dir === 'asc' ? 'currentColor' : 'none'}
        opacity={active && dir === 'asc' ? 1 : 0.3}
      />
      <path
        d="M12 19l-5-5h10z"
        fill={active && dir === 'desc' ? 'currentColor' : 'none'}
        opacity={active && dir === 'desc' ? 1 : 0.3}
      />
    </svg>
  );
}

export default function GiftTable({
  title,
  items,
  showGiveButton,
  showDeleteButton,
  editable,
  onGive,
  onDeleteMultiple,
  onUpdate,
  onDeleteReceipts,
}: GiftTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [priceFilter, setPriceFilter] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedItems.map((i) => i.id)));
    }
  }; // null = 전체, 1 = 1만원대, 2 = 2만원대...

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // 가격대 계산: 8천원 이상만 반올림 (29000→3, 8500→1), 그 아래는 버림 (7900→0)
  const getPriceTier = (price: number): number => {
    const remainder = price % 10000;
    return remainder >= 8000
      ? Math.ceil(price / 10000)
      : Math.floor(price / 10000);
  };

  // 가격대별 개수 집계
  const priceTiers = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of items) {
      const tier = getPriceTier(item.price);
      counts.set(tier, (counts.get(tier) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a - b);
  }, [items]);

  // 필터링 → 정렬
  const filteredItems = useMemo(() => {
    if (priceFilter === null) return items;
    return items.filter((i) => getPriceTier(i.price) === priceFilter);
  }, [items, priceFilter]);

  const sortedItems = useMemo(() => {
    if (!sortKey) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'orderDate') {
        cmp = a.orderDate.localeCompare(b.orderDate);
      } else {
        cmp = a.price - b.price;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredItems, sortKey, sortDir]);

  const totalPrice = filteredItems.reduce((sum, i) => sum + i.price, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {title} ({filteredItems.length}개{priceFilter !== null ? ` / 전체 ${items.length}개` : ''})
        </h2>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <button
              onClick={async () => {
                const res = await fetch('/api/receipts/download', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ids: Array.from(selectedIds) }),
                });
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `증빙서류_${new Date().toISOString().split('T')[0]}.zip`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              증빙 다운로드 ({selectedIds.size})
            </button>
          )}
          {showDeleteButton && selectedIds.size > 0 && (
            <button
              onClick={() => {
                if (confirm(`선택한 ${selectedIds.size}개 항목을 삭제하시겠습니까?`)) {
                  onDeleteMultiple?.(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }
              }}
              className="text-red-500 hover:text-red-700 text-sm font-medium"
            >
              선택 삭제 ({selectedIds.size})
            </button>
          )}
          {filteredItems.length > 0 && (
            <span className="text-sm text-gray-500">
              합계 {totalPrice.toLocaleString()}원
            </span>
          )}
        </div>
      </div>
      {items.length > 0 && priceTiers.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setPriceFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              priceFilter === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            전체
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-500 text-white text-[10px] font-bold">
              {items.length}
            </span>
          </button>
          {priceTiers.map(([tier, count]) => (
            <button
              key={tier}
              onClick={() =>
                setPriceFilter(priceFilter === tier ? null : tier)
              }
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                priceFilter === tier
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tier === 0 ? '1만원 미만' : `${tier}만원대`}
              <span className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                priceFilter === tier
                  ? 'bg-white text-blue-600'
                  : 'bg-gray-500 text-white'
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-gray-500 text-sm py-4 text-center">
          항목이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={sortedItems.length > 0 && selectedIds.size === sortedItems.length}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left">이미지</th>
                <th className="px-4 py-3 text-left">상품명</th>
                <th className="px-4 py-3 text-left">구매처</th>
                <th className="px-4 py-3 text-center">수량</th>
                <th
                  className="px-4 py-3 text-left cursor-pointer select-none hover:bg-gray-100"
                  onClick={() => handleSort('orderDate')}
                >
                  구매일
                  <SortIcon
                    active={sortKey === 'orderDate'}
                    dir={sortDir}
                  />
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer select-none hover:bg-gray-100"
                  onClick={() => handleSort('price')}
                >
                  개당가격
                  <SortIcon
                    active={sortKey === 'price'}
                    dir={sortDir}
                  />
                </th>
                <th className="px-4 py-3 text-center">증빙서류</th>
                {showGiveButton && (
                  <th className="px-4 py-3 text-center">액션</th>
                )}
                {!showGiveButton && (
                  <>
                    <th className="px-4 py-3 text-left">받은 사람</th>
                    <th className="px-4 py-3 text-left">선물 날짜</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedItems.map((item) => (
                <tr key={item.id} className={`hover:bg-gray-50 ${selectedIds.has(item.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.itemName}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                        없음
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{item.itemName}</td>
                  <td className="px-4 py-3 text-gray-600">{item.mall}</td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {editingId === item.id ? (
                      <input
                        type="number"
                        min={1}
                        defaultValue={item.quantity ?? 1}
                        onBlur={(e) => {
                          const newQty = parseInt(e.target.value) || 1;
                          if (newQty !== (item.quantity ?? 1)) {
                            const totalPrice = item.price * (item.quantity ?? 1);
                            const newUnitPrice = Math.round(totalPrice / newQty);
                            onUpdate?.(item.id, { quantity: newQty, price: newUnitPrice });
                          }
                        }}
                        className="w-14 text-center border border-blue-400 rounded px-1 py-0.5 text-sm"
                        autoFocus
                      />
                    ) : (
                      item.quantity ?? 1
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.orderDate}</td>
                  <td className="px-4 py-3 text-right">
                    {editingId === item.id ? (
                      <input
                        type="number"
                        min={0}
                        defaultValue={item.price}
                        onBlur={(e) => {
                          const newPrice = parseInt(e.target.value) || 0;
                          if (newPrice !== item.price) {
                            onUpdate?.(item.id, { price: newPrice });
                          }
                        }}
                        className="w-24 text-right border border-blue-400 rounded px-1 py-0.5 text-sm"
                      />
                    ) : (
                      `${item.price.toLocaleString()}원`
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center">
                      {item.orderSheetPath ? (
                        <a
                          href={`/api/receipts/${item.id}_order`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="주문내역서"
                          className="text-blue-500 hover:text-blue-700"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        </a>
                      ) : null}
                      {item.receiptPath ? (
                        <a
                          href={`/api/receipts/${item.id}_receipt`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="영수증"
                          className="text-purple-500 hover:text-purple-700"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v.5"/><path d="M12 6v.5"/></svg>
                        </a>
                      ) : null}
                      {(item.orderSheetPath || item.receiptPath) && onDeleteReceipts && (
                        <button
                          onClick={() => {
                            if (confirm('이 항목의 증빙서류를 삭제하시겠습니까?')) {
                              onDeleteReceipts(item.id);
                            }
                          }}
                          title="증빙 삭제"
                          className="text-gray-300 hover:text-red-500"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      )}
                      {!item.orderSheetPath && !item.receiptPath && (
                        <span className="text-gray-300">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        </span>
                      )}
                    </div>
                  </td>
                  {showGiveButton && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => onGive?.(item.id)}
                          title="선물하기"
                          className="text-pink-500 hover:text-pink-700"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                        </button>
                        {editable && (
                          editingId === item.id ? (
                            <button
                              onClick={() => setEditingId(null)}
                              title="편집 완료"
                              className="text-green-500 hover:text-green-700"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => setEditingId(item.id)}
                              title="수정"
                              className="text-gray-400 hover:text-blue-500"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  )}
                  {!showGiveButton && (
                    <>
                      <td className="px-4 py-3 text-gray-600">
                        {item.recipientName}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {item.givenDate}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
