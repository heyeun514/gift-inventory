import { chromium, Browser, Page } from 'playwright';

const LOGIN_URL = 'https://www.29cm.co.kr/member/login';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30분

type SessionStatus = 'idle' | 'waiting_login' | 'logged_in' | 'busy';

// globalThis에 저장하여 Next.js 핫 리로드에도 상태 유지
const globalStore = globalThis as unknown as {
  __browser?: Browser | null;
  __page?: Page | null;
  __sessionStatus?: SessionStatus;
  __inactivityTimer?: ReturnType<typeof setTimeout> | null;
  __taskQueue?: Promise<void>;
};

function getBrowser(): Browser | null {
  return globalStore.__browser ?? null;
}
function setBrowser(b: Browser | null) {
  globalStore.__browser = b;
}
function getPage(): Page | null {
  return globalStore.__page ?? null;
}
function setPage(p: Page | null) {
  globalStore.__page = p;
}
function getSessionStatus(): SessionStatus {
  return globalStore.__sessionStatus ?? 'idle';
}
function setSessionStatus(s: SessionStatus) {
  globalStore.__sessionStatus = s;
}
function getTaskQueue(): Promise<void> {
  return globalStore.__taskQueue ?? Promise.resolve();
}
function setTaskQueue(q: Promise<void>) {
  globalStore.__taskQueue = q;
}

function resetInactivityTimer() {
  if (globalStore.__inactivityTimer) clearTimeout(globalStore.__inactivityTimer);
  globalStore.__inactivityTimer = setTimeout(() => {
    console.log('세션 비활성 타임아웃 (30분). 자동 종료.');
    closeSession();
  }, INACTIVITY_TIMEOUT_MS);
}

export function getStatus(): SessionStatus {
  const browser = getBrowser();
  if (browser && !browser.isConnected()) {
    setBrowser(null);
    setPage(null);
    setSessionStatus('idle');
  }
  return getSessionStatus();
}

export async function startSession(): Promise<void> {
  const status = getSessionStatus();

  if (status === 'logged_in' || status === 'busy') {
    return;
  }
  if (status === 'waiting_login') {
    return;
  }

  const existing = getBrowser();
  if (existing) {
    try { await existing.close(); } catch { /* ignore */ }
  }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  setBrowser(browser);
  setPage(page);
  setSessionStatus('waiting_login');

  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });

  await page.waitForURL(
    (url) => {
      const u = url.toString();
      return (
        u.includes('29cm.co.kr') &&
        !u.includes('/login') &&
        !u.includes('member.one.musinsa')
      );
    },
    { timeout: 300000 },
  );

  setSessionStatus('logged_in');
  resetInactivityTimer();
  console.log('세션 로그인 완료');
}

export async function closeSession(): Promise<void> {
  if (globalStore.__inactivityTimer) {
    clearTimeout(globalStore.__inactivityTimer);
    globalStore.__inactivityTimer = null;
  }

  const browser = getBrowser();
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
    setBrowser(null);
    setPage(null);
  }

  setSessionStatus('idle');
  setTaskQueue(Promise.resolve());
  console.log('세션 종료');
}

export async function enqueueTask<T>(
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = getBrowser();
  const page = getPage();

  if (!browser || !browser.isConnected() || !page) {
    throw new Error('브라우저 세션이 없습니다. 먼저 로그인해주세요.');
  }

  const status = getSessionStatus();
  if (status !== 'logged_in' && status !== 'busy') {
    throw new Error('로그인되지 않은 상태입니다.');
  }

  return new Promise<T>((resolve, reject) => {
    const queue = getTaskQueue();
    const newQueue = queue.then(async () => {
      const prevStatus = getSessionStatus();
      setSessionStatus('busy');
      try {
        const result = await fn(page);
        setSessionStatus('logged_in');
        resetInactivityTimer();
        resolve(result);
      } catch (e) {
        setSessionStatus(prevStatus === 'busy' ? 'logged_in' : prevStatus);
        resetInactivityTimer();
        reject(e);
      }
    });
    setTaskQueue(newQueue);
  });
}
