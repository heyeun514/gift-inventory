import { chromium, Browser, Page } from 'playwright';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30분

export type MallType = '29CM' | 'NAVER';
type SessionStatus = 'idle' | 'waiting_login' | 'logged_in' | 'busy';

const MALL_LOGIN: Record<MallType, {
  loginUrl: string;
  isLoggedIn: (url: string) => boolean;
}> = {
  '29CM': {
    loginUrl: 'https://www.29cm.co.kr/member/login',
    isLoggedIn: (url) =>
      url.includes('29cm.co.kr') &&
      !url.includes('/login') &&
      !url.includes('member.one.musinsa'),
  },
  'NAVER': {
    loginUrl: 'https://pay.naver.com/pc/history',
    isLoggedIn: (url) =>
      url.includes('pay.naver.com') && !url.includes('nid.naver.com'),
  },
};

const globalStore = globalThis as unknown as {
  __browser?: Browser | null;
  __page?: Page | null;
  __sessionStatus?: SessionStatus;
  __sessionMall?: MallType | null;
  __inactivityTimer?: ReturnType<typeof setTimeout> | null;
  __taskQueue?: Promise<void>;
};

function getBrowser(): Browser | null { return globalStore.__browser ?? null; }
function setBrowser(b: Browser | null) { globalStore.__browser = b; }
function getPage(): Page | null { return globalStore.__page ?? null; }
function setPage(p: Page | null) { globalStore.__page = p; }
function getSessionStatus(): SessionStatus { return globalStore.__sessionStatus ?? 'idle'; }
function setSessionStatus(s: SessionStatus) { globalStore.__sessionStatus = s; }
function getTaskQueue(): Promise<void> { return globalStore.__taskQueue ?? Promise.resolve(); }
function setTaskQueue(q: Promise<void>) { globalStore.__taskQueue = q; }

export function getSessionMall(): MallType | null {
  return globalStore.__sessionMall ?? null;
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
    globalStore.__sessionMall = null;
  }
  return getSessionStatus();
}

export async function startSession(mall: MallType = '29CM'): Promise<void> {
  const status = getSessionStatus();
  const currentMall = getSessionMall();

  // 같은 쇼핑몰로 이미 로그인 되어있으면 스킵
  if ((status === 'logged_in' || status === 'busy') && currentMall === mall) return;
  if (status === 'waiting_login') return;

  // 다른 쇼핑몰이면 기존 세션 종료
  if (status === 'logged_in' || status === 'busy') {
    await closeSession();
  }

  const existing = getBrowser();
  if (existing) {
    try { await existing.close(); } catch { /* ignore */ }
  }

  const config = MALL_LOGIN[mall];
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  setBrowser(browser);
  setPage(page);
  setSessionStatus('waiting_login');
  globalStore.__sessionMall = mall;

  await page.goto(config.loginUrl, { waitUntil: 'networkidle' });

  await page.waitForURL(
    (url) => config.isLoggedIn(url.toString()),
    { timeout: 300000 },
  );

  setSessionStatus('logged_in');
  resetInactivityTimer();
  console.log(`${mall} 세션 로그인 완료`);
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
  globalStore.__sessionMall = null;
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
