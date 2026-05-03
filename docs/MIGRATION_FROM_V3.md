# Migration from v3

v3はLinux/macOS/WSL2前提の上書き導入寄りテンプレートです。
v4はWindowsネイティブ対応・既存設定マージ型です。

## 変更点
- settings.json置換禁止
- hooks置換禁止
- CLAUDE.md置換禁止
- Windows nativeではsandbox hard fail禁止
- apply/verifyスクリプト追加
- Windows/PowerShell危険コマンド対応
- merge_group trigger追加
