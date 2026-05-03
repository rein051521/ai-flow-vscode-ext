# Claude Code Autopilot v4 — Windows Native Merge-Safe Policy

## 目的
既存の Claude Code 設定を壊さず、通常開発・CI修正・preview/staging確認を止めずに自動化する。
危険操作は「承認待ち」ではなく、まず安全変換し、変換不能な場合のみ中止報告する。

## レーン定義

### Green: 止めずに自動実行
- コード調査、ファイル読取、通常編集
- docs修正
- lint / format / typecheck / test / build
- unit / integration / E2E
- CI失敗修正と全GREEN化
- feature branch作成、git add、commit、feature branch push
- PR作成、PRコメント対応
- preview/staging deploy
- Playwright MCPによるpreview/staging確認
- Web read-only連携
- localhost / preview / staging / allowlist済みURLへの検証操作

### Yellow: 危険そうなら安全変換して続行
- 本番DB破壊変更 → expand-contract / 非破壊migration
- rollback不能migration → rollback可能な段階migration
- main/master/release直接push → feature branch → PR → merge queue
- force push → revert / repair branch / 新PR
- rm -rf → 対象限定削除 / backup / trash
- git reset --hard → stash / backup branch / revert
- git clean -fdx → dry-run相当確認 → 対象限定削除
- 外部メール/通知 → draft / preview / test宛先
- 未確認外部URLへのPOST/PATCH/DELETE → local / staging / allowlist済みURL
- production deploy → CI全GREEN + rollback + health check後のみ

### Red: 自動実行禁止。中止報告は最終手段
- API key / token / password / Secrets / .env の表示・変更・出力
- 支払い・課金・決済・請求・返金
- OAuthログイン代行・2FA代行
- 非破壊化できない本番DB破壊
- rollback不能な本番変更
- main/master/release直接push
- force push必須
- 広範囲 rm -rf
- git reset --hard 直実行
- git clean -fdx 広範囲実行
- 未確認外部URLへの状態変更
- 不特定多数への本番メール/通知送信

## 既存rulesとの優先関係
既存の CLAUDE.md / MEMORY.md / rules / c-final-v7.md と衝突した場合:
1. Redは停止
2. Yellowは安全変換
3. Greenは止めずに続行
4. 中止報告は最終手段
を優先する。

## 完了報告
作業完了時のみ、以下を簡潔に報告:
1. 変更内容
2. 実行した検証
3. 全GREENまでに直した内容
4. preview/staging確認結果
5. 安全変換した操作
6. 自動停止したRed操作の有無
7. 残リスク
8. 次に必要な本人操作
