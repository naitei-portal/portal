# 内定者ポータル

内定者専用のポータルサイト。画面は GitHub Pages、データは会社ごとの Google スプレッドシート（GAS）。

- `docs/` … 画面（GitHub Pages で公開）。`clients.js` に会社コードと GAS の URL の対応を書く
- `gas/` … スプレッドシートに貼る Apps Script。手順は `gas/README.md`

このリポジトリは公開されます。内定者の情報やパスワードは置かないこと。
会社コードには社名を使わず、意味のないランダムな文字列にすること。

## 説明書

- お客様向け 運用ガイド：https://naitei-portal.github.io/portal/manual/customer.html（PDF：`docs/manual/customer.pdf`）
- 運営向け 導入手順書：https://naitei-portal.github.io/portal/manual/operator.html（PDF：`docs/manual/operator.pdf`）

説明書を直したら、PDF も作り直す（Chrome で開いて印刷 → PDF に保存、または Claude Code に依頼）。
