# アーカイブAPI（api.py @ 192.168.1.70:8766）管理者向け拡張仕様

> この文書は **恋乃夜まい_YT_Data / API_HANDOVER.md に追記する形**で実装側（nassy 側 AI）へ渡してください。
> 内容は「管理者がカテゴリを編集できる」「YT から削除された動画を公開検索に出さず、管理者・AI だけが使える」ことを目的とします。

## 1. 現状と方針

- 現在の api.py は**読み取り専用**。書き込み系メソッド（PATCH/PUT/DELETE 等）は 501 を返す。
- `video` の詳細（`GET /api/video/:id`）には `availability: "public"` フィールドが既に存在する。
- transcript は `GET /api/transcript/:videoId` が **カタログ索引とは独立に、ディスク上の整形済み字幕ファイルから ID 解決**できる（削除済み動画でもファイルが残っていれば取得可能）。
- 方針：
  - **`availability = "deleted"` の動画は、公開向けの `videos` / `search` / `stats` のデフォルト結果から除外する。**
  - `include_deleted=1` パラメータを付けると含める（管理者画面・AI（RAG）・要約生成が使う）。
  - transcript エンドポイントは削除済み動画でも引き続き取得可能とする（既にそうなっている）。

## 2. 認証（管理者エンドポイント共通）

- ヘッダ `X-Admin-Token: <token>` で認証。`/api/admin/*` の全エンドポイントに必須。
- api.py 側の設定（環境変数または設定ファイル）に `ADMIN_TOKEN` を持たせる。
  - `ADMIN_TOKEN` が未設定の場合は、管理者エンドポイント群を**無効化**して `501` を返す。
  - トークン不一致は `401 {"error":"unauthorized"}`。
- トークンは長いランダム文字列（例: `openssl rand -hex 32`）。URL に入れず、常にヘッダで渡す。ログに出力しない。
- 生成例（nassy 側で生成して mai-push 側に共有する）:
  ```bash
  openssl rand -hex 32
  ```
  - mai-push 側は `.env` の `ARCHIVE_ADMIN_TOKEN` に同じ値を設定する（設定までは管理エンドポイントが「トークン未設定」を返す）。

## 3. 新規エンドポイント

### 3.1 `GET /api/admin/status`

認証確認用。

**Response 200**
```json
{
  "ok": true,
  "source": "archive-admin-api",
  "serverTime": "2026-09-20T12:00:00Z"
}
```

---

### 3.2 `PUT /api/admin/video/:video_id`

動画メタデータの追加・更新（**upsert**）。存在しない `video_id` は新規作成。
このエンドポイントで以下を行う：

- **カテゴリの編集**（`categories` は「この動画のカテゴリ一式」で**完全置換**。空配列でクリア）
- **削除済み動画の登録**（`availability: "deleted"` を指定）
- 公開状態への復帰（`availability: "public"`）

**Request headers**
```
X-Admin-Token: <token>
Content-Type: application/json
```

**Request body**（指定したフィールドだけ更新。未指定フィールドは変更しない。全フィールド省略可）
```json
{
  "title": "【Collab】○○【恋乃夜まい/VTuber】",
  "kind": "live_archive",
  "availability": "deleted",
  "stream_date_jst": "2026-09-20",
  "stream_at_jst": "2026-09-20 20:00:00",
  "duration_sec": 7200,
  "url": "https://www.youtube.com/watch?v=XXXXXXXXXXXXXXXXXXX",
  "categories": ["雑談", "晩酌"],
  "game_title": null
}
```

**実装上の注意**

- `availability` 省略時は既存値を保つ。行が無く `availability` も無い場合は `"public"` にする。
- `availability: "deleted"` で登録する際、該当 ID の整形済み字幕ファイルがディスクに存在すれば、
  その字幕を検索索引（FTS）に含める（ただし**削除済みとして扱い**、デフォルト検索からは除外されるようにする）。
  字幕ファイルが無い場合はレスポンスに `"transcript": false` を含めて知らせる。
- 既存の `video` 詳細フィールド（`view_count` / `like_count` / `stats_snapshot_at` 等）はこのエンドポイントでは変更しない（取得元が別システムのため）。

**Response 200**
```json
{
  "ok": true,
  "video": {
    "video_id": "XXXXXXXXXXXXXXXXXXX",
    "title": "【Collab】○○【恋乃夜まい/VTuber】",
    "availability": "deleted",
    "categories": ["雑談", "晩酌"],
    "transcript": true
  }
}
```

**エラー**
- `400` : body が JSON でない、`video_id` が不正（11文字 [A-Za-z0-9_-] 以外）
- `401` : トークン不一致
- `501` : `ADMIN_TOKEN` 未設定（管理者機能無効）

---

### 3.3 `DELETE /api/admin/video/:video_id`

カタログ索引から**完全削除**（ディスク上の字幕/動画ファイルは削除しない）。

**Response 200**
```json
{ "ok": true, "deleted": "XXXXXXXXXXXXXXXXXXX" }
```

存在しない ID でも `{ "ok": true }` を返す（冪等）。

---

### 3.4 `GET /api/categories`

カテゴリのマスター一覧（管理者画面の選択肢・stats の補完用）。

公開エンドポイント（認証不要）。「現時点でカテゴリを持つ動画すべて」の集計を返す。
削除済み動画にだけ付いているカテゴリも含めること（参照側が選択肢から消さないように）。

**Response 200**
```json
{
  "categories": [
    { "name": "雑談", "count": 154 },
    { "name": "ASMR", "count": 316 }
  ]
}
```
※ 並び順は count 降順。count は「そのカテゴリを持つ動画の数」。

---

## 4. 既存エンドポイントのフィルタ仕様変更

以下の**既存公開エンドポイント**に `include_deleted` の挙動を追加する。
**任意のクエリに `include_deleted=1` を付けると、`availability="deleted"` の動画も結果に含まれる。**
付けなければ従来どおり（ただし `deleted` 分は除外）になる。

| エンドポイント | デフォルト | `include_deleted=1` |
| --- | --- | --- |
| `GET /api/videos` | deleted 除外 | deleted 含む |
| `GET /api/videos?availability=deleted` | この指定は元々フィルタが効いていないので、**正しく availability で絞り込む**ように実装する | —（availability 指定でその値だけ返す） |
| `GET /api/search`（transcript/ ほか） | deleted 除外 | deleted 含む |
| `GET /api/stats` | deleted 除外（カテゴリ集計も deleted を含めない） | deleted 含む |

補足：
- `GET /api/search` が返す `videos` マップと transcript ヒットの**両方**に適用する。
- 検索索引（FTS）は「ディスク上に整形済み字幕がある全 ID」に対して構築し、
  各 ID が deleted かどうかを availability で判定して除外できる構造にすること
  （これにより、追加された削除済み動画が検索可能＝AI から参照可能になる）。
- 画面側（`?include_deleted=1` を付けない通常の検索）には影響しない＝**公開検索に削除済み動画が出ない**。

## 5. 主なレスポンス例（現行の形を維持すること）

### `GET /api/videos`（videos リスト）
```json
{
  "total": 809,
  "limit": 100,
  "offset": 0,
  "videos": [
    {
      "video_id": "lDIEOM5vo-I",
      "title": "【Collab】大型新人「焔鬼シャナ」は何者？！...",
      "kind": "live_archive",
      "availability": "public",
      "stream_date_jst": "2026-09-18",
      "stream_at_jst": "2026-09-18 23:00:21",
      "duration_sec": 8525,
      "url": "https://www.youtube.com/watch?v=lDIEOM5vo-I"
    }
  ]
}
```

### `GET /api/video/:id`（動画詳細）→ categories を含む
```json
{
  "video_id": "RGqck5BovOc",
  "title": "...",
  "availability": "public",
  "stream_date_jst": "2023-10-03",
  "stream_at_jst": "2023-10-03 21:59:40",
  "duration_sec": 12794,
  "categories": ["Game"],
  "collaborators": []
}
```

### `GET /api/search?q=...&kind=transcript&include_deleted=1`
```json
{
  "query": "こんにちは",
  "transcript": [
    {
      "video_id": "RGqck5BovOc",
      "title": "...",
      "start_ms": 1910159,
      "end_ms": 1955600,
      "start": "31.8分",
      "url": "https://www.youtube.com/watch?v=RGqck5BovOc&t=1910s",
      "snippet": "[こんにちはこんにちは]",
      "text": "10時間いらん はい はい こんにちは...",
      "stream_date_jst": "2023-10-03",
      "stream_at_jst": "2023-10-03 21:59:40",
      "thumbnail": "/api/thumbnail/RGqck5BovOc"
    }
  ],
  "videos": {
    "RGqck5BovOc": {
      "video_id": "RGqck5BovOc",
      "title": "...",
      "kind": "live_archive",
      "stream_date_jst": "2023-10-03",
      "stream_at_jst": "2023-10-03 21:59:40",
      "duration_sec": 12794,
      "categories": ["Game"],
      "thumbnail": "/api/thumbnail/RGqck5BovOc"
    }
  }
}
```

## 6. 互換性・注意点

- **既存の読取エンドポイントのレスポンス構造を壊さないこと。** 追加は「デフォルトで deleted を除外」「新クエリで含める」だけ。
- 管理者エンドポイントは**キャッシュしない**前提で、`X-Admin-Token` を必ず検証する。
- `PUT` は毎回フル差分でなく「指定フィールドのみ更新」とし、冪等に使えること。
- `video_id` は `^[A-Za-z0-9_-]{11}$` を検証する。
- トークンが漏れた場合は nassy 側で値を変え、mai-push 側の `.env` を更新する。

## 7. 実装してほしい順

1. `ADMIN_TOKEN` 設定と `X-Admin-Token` 検証（`GET /api/admin/status` を先に）
2. `PUT /api/admin/video/:id`（カテゴリ置換 + availability 変更 + 新規作成）
3. `DELETE /api/admin/video/:id`
4. `GET /api/videos` の `availability` フィルタを正しく実装し、`include_deleted=1` を追加
5. `GET /api/search` / `GET /api/stats` に `include_deleted=1` を追加（デフォルトは deleted 除外）
6. `GET /api/categories` を追加

## 8. 動作確認（推奨）

- 認証なし: `curl -s http://192.168.1.70:8766/api/admin/video/XXXXXXXXXXXXXXXXXXX` → `401`
- トークンなし運用: 起動時に `ADMIN_TOKEN` 未設定 → `/api/admin/status` が `501`
- 公開結果から除外確認:
  - `GET /api/videos` → 削除済み ID が混ざっていない
  - `GET /api/videos?include_deleted=1` → 混ざっている
  - `GET /api/search?q=...` → 削除済みヒットなし / `&include_deleted=1` → ヒットあり
  - `GET /api/transcript/<削除済みID>` → 200（従来どおり取得可能）