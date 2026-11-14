#!/usr/bin/env bash
# 本機以 kk-ec2 副本環境變數啟動網站（真 node 行程、真 Postgres 連線），供四入口煙霧測試使用。
# 用法：DATABASE_URL=postgres://... PORT=18080 scripts/kk-ec2-run-local.sh
# 讀 kk-ec2.env.example 的非註解鍵；APP_SECRET 未提供時臨時產生（只在本行程使用、不落檔）。
set -euo pipefail
cd "$(dirname "$0")/.."
while IFS= read -r line; do
  case "$line" in ''|\#*) continue;; esac
  export "${line?}"
done < kk-ec2.env.example
export APP_SECRET="${APP_SECRET:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
export PORT="${PORT:-18080}"
exec node bootstrap.js
