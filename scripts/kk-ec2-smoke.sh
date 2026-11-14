#!/usr/bin/env bash
# 四入口煙霧測試：對執行中的網站以 Host 標頭打 www／裸網域／pos／app（＋/api/health）。
# 用法：scripts/kk-ec2-smoke.sh [base_url] [domain]
#   本機：scripts/kk-ec2-smoke.sh http://127.0.0.1:18080 emoji.deploy.43-213-238-222.nip.io
#   kk-ec2 Caddy 前（公開網址）：scripts/kk-ec2-smoke.sh https://www.emoji.deploy.43-213-238-222.nip.io（會改用真網域，不帶 Host）
# 結果每行一個檢查；全部通過最後印 SMOKE_OK，否則 SMOKE_FAIL 並以 1 結束。
set -u
BASE="${1:-http://127.0.0.1:18080}"; D="${2:-emoji.deploy.43-213-238-222.nip.io}"
fail=0
chk() { # name host path expect_status [expect_location_prefix|body_regex]
  local name=$1 host=$2 p=$3 want=$4 extra=${5:-} out code loc
  if [[ "$BASE" == http://127.0.0.1* || "$BASE" == http://localhost* ]]; then
    out=$(curl -s -m 20 -o /tmp/kk-smoke.body -w '%{http_code} %{redirect_url}' -H 'Accept-Language: zh-TW' -H "Host: $host" "$BASE$p")
  else
    out=$(curl -s -m 20 -o /tmp/kk-smoke.body -w '%{http_code} %{redirect_url}' -H 'Accept-Language: zh-TW' "https://$host$p")
  fi
  code=${out%% *}; loc=${out#* }
  if [[ "$code" != "$want" ]]; then echo "FAIL $name $host$p → $code（預期 $want）"; fail=1; return; fi
  if [[ -n "$extra" ]]; then
    if [[ "$want" == 30* ]]; then [[ "$loc" == "$extra"* ]] || { echo "FAIL $name 轉到 $loc（預期 $extra…）"; fail=1; return; }
    else grep -qE "$extra" /tmp/kk-smoke.body || { echo "FAIL $name 內容不含 /$extra/"; fail=1; return; }; fi
  fi
  echo "ok   $name $host$p → $code ${loc}"
}
chk www-home      "www.$D"   /            200 '<html'
chk www-en       "www.$D"   /en          200 '<html'
chk www-health    "www.$D"   /api/health  200 '"ok":true'
chk apex-redirect "$D"       /events?x=1  308 "https://www.$D/events?x=1"
chk pos-picker    "pos.$D"   /            200 'renderBrandPicker'
chk pos-brand     "pos.$D"   /atcafe      200 'renderBrandPicker'
chk pos-legacy    "www.$D"   /pos         302 "https://pos.$D/"
chk app-pwa       "app.$D"   /            200 'tth_token'
chk app-offsite   "app.$D"   /events      302 "https://www.$D/events"
chk app-health    "app.$D"   /api/health  200 '"db":true'
rm -f /tmp/kk-smoke.body
[[ $fail == 0 ]] && echo SMOKE_OK || { echo SMOKE_FAIL; exit 1; }
