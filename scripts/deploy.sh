#!/bin/bash
set -e

echo "========================================="
echo "  Gift Inventory Sync - 배포 스크립트"
echo "========================================="
echo ""

# 1. 필수 도구 확인
if ! command -v vercel &> /dev/null; then
  echo "[1/5] Vercel CLI 설치 중..."
  npm install -g vercel
else
  echo "[1/5] Vercel CLI 확인 완료"
fi

# 2. 데이터 파일 git 추가
echo "[2/5] 데이터 파일 커밋 중..."
git add data/inventory.json data/receipts/ 2>/dev/null || true

if git diff --cached --quiet; then
  echo "  변경된 데이터 없음, 스킵"
else
  git commit -m "chore: sync inventory data for deployment"
  echo "  데이터 커밋 완료"
fi

# 3. Vercel 배포
echo "[3/5] Vercel 배포 중..."
echo ""
echo "  ※ 최초 배포 시 Vercel 로그인 및 프로젝트 설정이 필요합니다."
echo "  ※ 환경변수 DEPLOY_MODE=deployed 가 설정되어 있는지 확인하세요."
echo ""

DEPLOY_URL=$(vercel --prod 2>&1 | grep -oE 'https://[^ ]+' | tail -1)

if [ -z "$DEPLOY_URL" ]; then
  echo "  ⚠️  배포 URL을 찾을 수 없습니다. Vercel 대시보드에서 확인하세요."
  echo "  수동으로 KV 동기화: curl -X POST <배포URL>/api/inventory/sync"
  exit 1
fi

echo "  배포 완료: $DEPLOY_URL"

# 4. KV 데이터 동기화
echo "[4/5] KV 데이터 동기화 중..."
SYNC_RESULT=$(curl -s -X POST "${DEPLOY_URL}/api/inventory/sync")
echo "  결과: $SYNC_RESULT"

# 5. 검증
echo "[5/5] 배포 검증 중..."
INVENTORY=$(curl -s "${DEPLOY_URL}/api/inventory")
ITEM_COUNT=$(echo "$INVENTORY" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null || echo "확인 실패")
echo "  배포된 아이템 수: $ITEM_COUNT"

echo ""
echo "========================================="
echo "  배포 완료!"
echo "  URL: $DEPLOY_URL"
echo "========================================="
