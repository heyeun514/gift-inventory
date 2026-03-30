'use client';

import { useState } from 'react';

interface GiveModalProps {
  quantity: number;
  itemName: string;
  onConfirm: (recipients: { name: string; qty: number }[]) => void;
  onCancel: () => void;
}

export default function GiveModal({
  quantity,
  itemName,
  onConfirm,
  onCancel,
}: GiveModalProps) {
  const [rows, setRows] = useState([{ name: '', qty: 1 }]);

  const usedQty = rows.reduce((sum, r) => sum + r.qty, 0);
  const remainingQty = quantity - usedQty;

  const addRow = () => {
    if (remainingQty > 0) {
      setRows([...rows, { name: '', qty: 1 }]);
    }
  };

  const updateRow = (idx: number, field: 'name' | 'qty', value: string | number) => {
    const next = [...rows];
    if (field === 'name') {
      next[idx].name = value as string;
    } else {
      next[idx].qty = Math.max(1, value as number);
    }
    setRows(next);
  };

  const removeRow = (idx: number) => {
    if (rows.length > 1) {
      setRows(rows.filter((_, i) => i !== idx));
    }
  };

  const isValid =
    rows.every((r) => r.name.trim() && r.qty >= 1) &&
    usedQty <= quantity;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(rows.map((r) => ({ name: r.name.trim(), qty: r.qty })));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-1">선물하기</h3>
        <p className="text-sm text-gray-500 mb-4 truncate">
          {itemName} (보유 {quantity}개)
        </p>

        <div className="space-y-3 mb-4">
          {rows.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateRow(idx, 'name', e.target.value)}
                placeholder="받는 사람"
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                autoFocus={idx === 0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValid) handleConfirm();
                }}
              />
              {quantity > 1 && (
                <input
                  type="number"
                  value={row.qty}
                  onChange={(e) =>
                    updateRow(idx, 'qty', parseInt(e.target.value) || 1)
                  }
                  min={1}
                  max={quantity}
                  className="w-16 border border-gray-300 rounded-md px-2 py-2 text-sm text-center"
                />
              )}
              {rows.length > 1 && (
                <button
                  onClick={() => removeRow(idx)}
                  className="text-gray-400 hover:text-red-500 text-lg"
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>

        {quantity > 1 && remainingQty > 0 && (
          <button
            onClick={addRow}
            className="text-blue-600 hover:text-blue-800 text-sm mb-4 block"
          >
            + 받는 사람 추가 (잔여 {remainingQty}개)
          </button>
        )}

        {usedQty > quantity && (
          <p className="text-red-500 text-xs mb-3">
            수량을 초과했습니다 ({usedQty}/{quantity})
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="bg-pink-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-pink-600 disabled:bg-gray-400"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
