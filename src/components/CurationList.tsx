'use client';

import { GiftItem } from '@/types';

interface CurationListProps {
  items: GiftItem[];
  excludedIds: Set<string>;
  onToggleExclude: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

export default function CurationList({
  items,
  excludedIds,
  onToggleExclude,
  onSave,
  onCancel,
  saving,
}: CurationListProps) {
  if (items.length === 0) return null;

  const selectedCount = items.length - excludedIds.size;

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          수집 결과 검수 ({selectedCount}/{items.length}개 선택)
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={onSave}
            disabled={saving || selectedCount === 0}
            className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:bg-gray-400"
          >
            {saving ? '저장 중...' : `선택 항목 저장 (${selectedCount}개)`}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">선택</th>
              <th className="px-4 py-3 text-left">이미지</th>
              <th className="px-4 py-3 text-left">상품명</th>
              <th className="px-4 py-3 text-left">구매일</th>
              <th className="px-4 py-3 text-right">가격</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item) => (
              <tr
                key={item.id}
                className={excludedIds.has(item.id) ? 'opacity-40' : ''}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={!excludedIds.has(item.id)}
                    onChange={() => onToggleExclude(item.id)}
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
                <td className="px-4 py-3 text-gray-600">{item.orderDate}</td>
                <td className="px-4 py-3 text-right">
                  {item.price.toLocaleString()}원
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
