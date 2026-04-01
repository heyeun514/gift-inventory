'use client';

import { useState, useEffect, useCallback } from 'react';
import { GiftItem } from '@/types';
import DateRangePicker from '@/components/DateRangePicker';
import CurationList from '@/components/CurationList';
import GiftTable from '@/components/GiftTable';
import GiveModal from '@/components/GiveModal';
import ResetModal from '@/components/ResetModal';

type SessionStatus = 'idle' | 'waiting_login' | 'logged_in' | 'busy';
type MallType = '29CM' | 'NAVER';

export default function AdminPage() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [sessionMall, setSessionMall] = useState<MallType | null>(null);
  const [selectedMall, setSelectedMall] = useState<MallType>('29CM');
  const [sessionLoading, setSessionLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scrapedItems, setScrapedItems] = useState<GiftItem[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [inventory, setInventory] = useState<GiftItem[]>([]);
  const [giveTargetId, setGiveTargetId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'available' | 'given'>('available');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/session/status');
        const data = await res.json();
        setSessionStatus(data.status);
        if (data.mall) setSessionMall(data.mall);
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStartSession = async () => {
    setSessionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mall: selectedMall }),
      });
      const data = await res.json();
      setSessionStatus(data.status);
      setSessionMall(selectedMall);
      if (data.status === 'logged_in') {
        setMessage({ type: 'success', text: '로그인 완료!' });
      }
    } catch {
      setMessage({ type: 'error', text: '세션 시작에 실패했습니다.' });
    } finally {
      setSessionLoading(false);
    }
  };

  const handleCloseSession = async () => {
    await fetch('/api/session/close', { method: 'POST' });
    setSessionStatus('idle');
    setSessionMall(null);
    setMessage({ type: 'success', text: '세션이 종료되었습니다.' });
  };

  const fetchInventory = useCallback(async () => {
    const res = await fetch('/api/inventory');
    const data = await res.json();
    setInventory(data.items || []);
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleScrape = async () => {
    setScraping(true);
    setMessage(null);
    setScrapedItems([]);
    setExcludedIds(new Set());
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, mall: sessionMall }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error }); return; }
      if (data.items.length === 0) { setMessage({ type: 'error', text: '수집된 항목이 없습니다.' }); return; }
      const existingIds = new Set(inventory.map((i) => i.id));
      const newItems = data.items.filter((i: GiftItem) => !existingIds.has(i.id));
      if (newItems.length === 0) { setMessage({ type: 'error', text: '모든 항목이 이미 저장되어 있습니다.' }); return; }
      setScrapedItems(newItems);
    } catch {
      setMessage({ type: 'error', text: '스크래핑 요청에 실패했습니다.' });
    } finally {
      setScraping(false);
    }
  };

  const handleToggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const itemsToSave = scrapedItems.filter((i) => !excludedIds.has(i.id));
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSave }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error }); return; }

      const itemsWithReceipt = itemsToSave.filter((i) => i.detailUrl);
      if (itemsWithReceipt.length > 0) {
        setMessage({ type: 'success', text: `${data.added}개 저장 완료. 영수증 캡처 중...` });
        try {
          const receiptRes = await fetch('/api/receipts/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsWithReceipt }),
          });
          const receiptData = await receiptRes.json();
          setMessage({
            type: 'success',
            text: `${data.added}개 저장, 영수증 ${receiptData.captured}개 캡처 완료${data.skipped > 0 ? ` (${data.skipped}개 중복)` : ''}`,
          });
        } catch {
          setMessage({ type: 'success', text: `${data.added}개 저장 완료 (영수증 캡처 실패)` });
        }
      } else {
        setMessage({
          type: 'success',
          text: `${data.added}개 저장 완료${data.skipped > 0 ? ` (${data.skipped}개 중복 건너뜀)` : ''}`,
        });
      }
      setScrapedItems([]);
      setExcludedIds(new Set());
      await fetchInventory();
    } catch {
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

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

  const handleDeleteMultiple = async (ids: string[]) => {
    try {
      const res = await fetch('/api/inventory/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: 'success', text: `${data.deleted}개 삭제되었습니다.` });
        await fetchInventory();
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error });
      }
    } catch {
      setMessage({ type: 'error', text: '삭제에 실패했습니다.' });
    }
  };

  const handleReset = async () => {
    setShowResetModal(false);
    try {
      const res = await fetch('/api/inventory/reset', { method: 'POST' });
      if (res.ok) {
        setMessage({ type: 'success', text: '모든 데이터가 초기화되었습니다.' });
        setScrapedItems([]);
        setExcludedIds(new Set());
        await fetchInventory();
      } else {
        setMessage({ type: 'error', text: '초기화에 실패했습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '초기화에 실패했습니다.' });
    }
  };

  const availableItems = inventory.filter((i) => i.status === 'AVAILABLE');
  const givenItems = inventory.filter((i) => i.status === 'GIVEN');
  const isLoggedIn = sessionStatus === 'logged_in' || sessionStatus === 'busy';

  const sessionStatusLabel: Record<SessionStatus, { text: string; color: string }> = {
    idle: { text: '미연결', color: 'bg-gray-400' },
    waiting_login: { text: '로그인 대기 중...', color: 'bg-yellow-400' },
    logged_in: { text: '연결됨', color: 'bg-green-500' },
    busy: { text: '작업 중...', color: 'bg-blue-500' },
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Gift Inventory - Admin
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              구매 이력 수집 및 선물 관리
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              공개 페이지
            </a>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${sessionStatusLabel[sessionStatus].color}`}
              />
              <span className="text-sm text-gray-600">
                {sessionMall ? `${sessionMall} ` : ''}{sessionStatusLabel[sessionStatus].text}
              </span>
            </div>
            {sessionStatus === 'idle' ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedMall}
                  onChange={(e) => setSelectedMall(e.target.value as MallType)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="29CM">29CM</option>
                  <option value="NAVER">네이버 스토어</option>
                </select>
                <button
                  onClick={handleStartSession}
                  disabled={sessionLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {sessionLoading ? '연결 중...' : '로그인'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleCloseSession}
                disabled={sessionStatus === 'busy'}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                세션 종료
              </button>
            )}
          </div>
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

        {!isLoggedIn && (
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg text-sm text-yellow-800">
            구매 이력을 수집하려면 먼저 상단의 &quot;29CM 로그인&quot; 버튼을 눌러 로그인하세요.
          </div>
        )}

        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onScrape={handleScrape}
          loading={scraping}
          disabled={!isLoggedIn}
        />

        <CurationList
          items={scrapedItems}
          excludedIds={excludedIds}
          onToggleExclude={handleToggleExclude}
          onSave={handleSave}
          onCancel={() => {
            setScrapedItems([]);
            setExcludedIds(new Set());
          }}
          saving={saving}
        />

        <div className="flex justify-end">
          <button
            onClick={() => setShowResetModal(true)}
            className="text-red-500 hover:text-red-700 text-sm underline"
          >
            데이터 초기화
          </button>
        </div>

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
              showDeleteButton
              editable
              onGive={(id) => setGiveTargetId(id)}
              onDeleteMultiple={handleDeleteMultiple}
              onUpdate={async (id, updates) => {
                try {
                  await fetch('/api/inventory/update', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, ...updates }),
                  });
                  await fetchInventory();
                } catch { /* ignore */ }
              }}
              onDeleteReceipts={async (id) => {
                try {
                  const res = await fetch('/api/receipts/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id }),
                  });
                  if (res.ok) {
                    setMessage({ type: 'success', text: '증빙서류가 삭제되었습니다.' });
                    await fetchInventory();
                  }
                } catch { /* ignore */ }
              }}
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

      {showResetModal && (
        <ResetModal
          onConfirm={handleReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </div>
  );
}
