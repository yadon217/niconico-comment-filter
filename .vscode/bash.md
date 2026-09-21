# niconico-comment-filter — コピペ用メモ

## remote

```bash
cd /home/node/Dev/niconico-comment-filter
git remote -v
# origin  https://github.com/yadon217/niconico-comment-filter.git
```

## テスト

```bash
npm test
```

## 動作確認（Git）

| 確認 | 手順 |
|---|---|
| GitDoc | `.md` を編集して Save → 遅延（5分）後に commit & push |
| Hook | Agent が `src/` 等を編集してターン終了 → auto-git-sync |
| ログ | `.cursor/hooks/sync.log`（git 管理外） |

## 参照

- テンプレ正本: `~/Notion/docs/workflows/gitdoc-setup.md`
- 設計書: https://app.notion.com/p/3e2847c9637a81d3b13cfa357b775d16
