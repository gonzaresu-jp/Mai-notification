#!/usr/bin/env bash
# コード行数集計スクリプト（updateLogs の "lines" 値の公式計測方法）
#
# 集計対象: git 追跡ファイル（git ls-files）
# 除外対象: 生成物・ビルド出力・素材で、手書きソース以外のもの
#   - webui/dist/ 全体（esbuild による minify 済み出力）
#   - *.min.js / *.min.css（分散している minify 済みファイル）
#   - package-lock.json（npm が自動生成するロックファイル）
#   - *.svg（アイコン素材）
#   - webui/compare.html（比較レポート用の自動生成HTML）
#
# 使い方:
#   scripts/count-lines.sh                 # 現在の作業ツリーで集計
#   scripts/count-lines.sh <rev>           # 過去のコミット時点で集計（例: 1496a83）
#
# 出力: cloc の SUM code 行数（最終行の SUM の code 列）

set -euo pipefail

if [ $# -gt 1 ]; then
    echo "usage: $0 [<git-rev>]" >&2
    exit 2
fi

REV="${1:-}"
if [ -n "$REV" ]; then
    FILES="$(git ls-tree -r --name-only "$REV")"
else
    FILES="$(git ls-files)"
fi

echo "$FILES" | grep -vE "(^webui/dist/|\.min\.(js|css)$|package-lock\.json$|\.svg$|^webui/compare\.html$)" \
    | cloc --list-file=/dev/stdin --quiet 2>/dev/null \
    | awk -F' ' '/^SUM:/ {print $NF}'