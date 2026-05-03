# WSL2 / Linux / macOS Strict Guide

WSL2/Linux/macOSでは sandbox.enabled=true / failIfUnavailable=true を推奨します。

## 理由
Bash subprocess経由のファイル・ネットワーク到達をOSレベルで制限できるため、通常開発を広く自動化しつつ危険操作を抑えやすいです。
