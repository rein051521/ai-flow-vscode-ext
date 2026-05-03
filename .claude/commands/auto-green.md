# /auto-green

CI/test/lint/typecheck/build/E2E/security/secrets scan を全GREENにする。

## ループ
1. failed check取得
2. ログ分類
3. 原因特定
4. 最小差分修正
5. 関連検証
6. commit
7. feature branch push
8. CI再確認
9. 全GREENまで繰り返し

## 中止条件
- Secrets/API key/passwordが必要
- 支払い/課金/返金が必要
- rollback不能な本番変更が必要
- 同じ失敗が3回連続で根本原因不明
- 影響範囲不明のproduction操作が必要
