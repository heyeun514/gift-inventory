#!/bin/bash
set -e

echo "========================================="
echo "  Gift Inventory Sync - 데이터 동기화"
echo "========================================="
echo ""

# 배포 URL 확인
DEPLOY_URL=$(vercel inspect --scope 2>/dev/null | grep -oE 'https://[^ ]+' | head -1 2>/dev/null || echo "")

if [ -z "$DEPLOY_URL" ]; then
  # vercel.json이나 .vercel에서 URL 가져오기
  if [ -f ".vercel/project.json" ]; then
    echo "배포 URL을 입력해주세요:"
    read -r DEPLOY_URL
  else
    echo "Vercel 프로젝트가 연결되어 있지 않습니다. 먼저 deploy.sh를 실행하세요."
    exit 1
  fi
fi

# 1. 데이터 커밋
echo "[1/3] 데이터 변경 확인..."
git add data/inventory.json data/receipts/ 2>/dev/null || true

if git diff --cached --quiet; then
  echo "  로컬 데이터 변경 없음"
else
  git commit -m "chore: sync inventory data"
  echo "  데이터 커밋 완료"
fi

# 2. 배포
echo "[2/3] Vercel 재배포..."
DEPLOY_URL=$(vercel --prod 2>&1 | grep -oE 'https://[^ ]+' | tail -1)
echo "  배포: $DEPLOY_URL"

# 3. KV 동기화
echo "[3/3] KV 동기화..."
SYNC_RESULT=$(curl -s -X POST "${DEPLOY_URL}/api/inventory/sync")
echo "  결과: $SYNC_RESULT"

echo ""
echo "동기화 완료!"
