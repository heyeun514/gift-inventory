'use client';

interface ResetModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ResetModal({ onConfirm, onCancel }: ResetModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-lg font-semibold mb-2 text-red-600">
          데이터 초기화
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          모든 선물 리스트와 저장된 영수증이 삭제됩니다. 이 작업은 되돌릴 수
          없습니다. 계속하시겠습니까?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
          >
            초기화
          </button>
        </div>
      </div>
    </div>
  );
}
