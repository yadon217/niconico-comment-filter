# niconico-comment-filter

ニコニコ動画のコメントを、ローカルルールで非表示にする個人向け Chrome 拡張（Manifest V3）。NGワード・ユーザー・文字数・正規表現に加え、コメント種別（色・サイズ・位置）でも非表示にできます。

人間向けの設計・手順の正本は Notion: [【設計書】ニコニコ動画 コメントフィルター Chrome拡張](https://app.notion.com/p/3e2847c9637a81d3b13cfa357b775d16)

## Chrome Web Store

- 現在: **v0.1.3** を審査提出済み（2026-09-28、審査待ち）
- 手順・提出ログ: [Chrome Web Store 公開手順](https://app.notion.com/p/3e9847c9637a81c5b858ccc3b91adb13)
- プライバシーポリシー: [Notion（Web 公開）](https://app.notion.com/p/3e9847c9637a814ba31af9df0a66b0f5)

## 読み込み

1. Chrome で `chrome://extensions`
2. デベロッパーモードをオン
3. 「パッケージ化されていない拡張機能を読み込む」→ このリポジトリのルート

初回および `src/content/page-hook.js` / `index.js` 変更後は `npm run build` を実行してから拡張を更新する（manifest は `*.bundle.js` を読み込む）。
