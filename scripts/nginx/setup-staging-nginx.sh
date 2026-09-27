#!/usr/bin/env bash
# setup-staging-nginx.sh - サブドメイン mai-test.honna-yuzuki.com 用 nginx 設定をインストール
# 実行: sudo bash scripts/nginx/setup-staging-nginx.sh
# （sudo で本物の /etc/nginx への書き込みが必要なためインタラクティブに実行してください）
set -euo pipefail
cd "$(dirname "$0")"   # scripts/nginx

sudo cp mai-test.conf /etc/nginx/sites-available/mai-test.conf
sudo ln -sf /etc/nginx/sites-available/mai-test.conf /etc/nginx/sites-enabled/mai-test
sudo nginx -t
sudo systemctl reload nginx
echo "OK: mai-test vhost enabled."
echo "次に Cloudflare DNS で mai-test.honna-yuzuki.com を mai.honna-yuzuki.com と同じターゲットに向けてください。"
