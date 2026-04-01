#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo ""
echo "  Gift Inventory Sync - 배포"
echo "  =========================="
echo ""

# 1. 변경사항 커밋
git add -A
if git diff --cached --quiet; then
  echo "  [1/3] 변경사항 없음"
else
  read -p "  커밋 메시지 (Enter=자동): " MSG
  MSG="${MSG:-chore: update and deploy}"
  git commit -m "$MSG"
  echo "  [1/3] 커밋 완료"
fi

# 2. Vercel 배포
echo "  [2/3] 배포 중..."
URL=$(vercel --prod 2>&1 | grep -oE 'https://gift-inventory-sync[^ ]+\.vercel\.app' | tail -1)
echo "  [2/3] 배포 완료: ${URL:-gift-inventory-sync.vercel.app}"

# 3. Redis 동기화
echo "  [3/3] Redis 동기화 중..."
RESULT=$(curl -s -X POST https://gift-inventory-sync.vercel.app/api/inventory/sync)
echo "  [3/3] $RESULT"

echo ""
echo "  완료! https://gift-inventory-sync.vercel.app"
echo ""
