# niconico-comment-filter

ニコニコ動画のコメントを、ローカルルールで非表示にする個人向け Chrome 拡張（Manifest V3）。

人間向けの設計・手順の正本は Notion: [【設計書】ニコニコ動画 コメントフィルター Chrome拡張](https://app.notion.com/p/3e2847c9637a81d3b13cfa357b775d16)

## 読み込み

1. Chrome で `chrome://extensions`
2. デベロッパーモードをオン
3. 「パッケージ化されていない拡張機能を読み込む」→ このリポジトリのルート

`page-hook.js` / `index.js` を変更したときは `npm run build` で `*.bundle.js` を再生成してから拡張を更新する。
