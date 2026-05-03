# /safe-release

merge/deploy/DB変更を機械条件で進める。

## merge条件
- PR経由
- required checks全GREEN
- secrets scan 0
- unresolved commentsなし
- 変更範囲が仕様内
- merge queue/auto-merge優先

## production deploy条件
- CI全GREEN
- staging成功
- rollback手順あり
- health checkあり
- Secrets/API/payment/password変更なし

## DB条件
- 非破壊migration原則
- expand-contract優先
- backup/rollbackあり
- staging成功
- 影響範囲確認済み
