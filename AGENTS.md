# AGENTS.md — niconico-comment-filter

## 正本

- 人間向け設計・運用: [Notion 設計書](https://app.notion.com/p/3e2847c9637a81d3b13cfa357b775d16)
- ローカル Markdown は Agent 向け内部資料のみ。長い人間向け文書をここに増やさない。
- 実装で仕様が変わったら Notion 側も同じターンで更新する。

## スコープ

- PC 版 `https://www.nicovideo.jp/watch/*` のみ
- 受信済みコメントの表示可否だけをローカルで制御する
- コメント本文・NG リストを外部送信しない
- 権限は `storage` とニコニコ関連 host のみ

## 構成

| パス | 責務 |
|---|---|
| `src/shared/filter-engine.js` | サイト非依存の判定 |
| `src/shared/schema.js` | 設定スキーマ・バリデーション |
| `src/content/comment-adapter.js` | ニコニコ固有の取得・DOM |
| `src/content/page-hook.js` | MAIN world の fetch フック（必要な場合のみ） |
| `src/popup/` `src/options/` | UI |
| `tests/` | Filter Engine の Vitest |

## 制約

- ニコニコ固有セレクタ・API を Filter Engine に書かない
- MAIN world へ渡すメッセージは origin と形を検証する
- `innerHTML` に生文字列を入れない
- force push しない。`.env` をコミットしない

## テスト

```bash
npm test
```

設計書 §14.1 のケースを維持する。
