# Windows Native Guide

## 結論
Windowsネイティブでは sandbox.failIfUnavailable=true を強制しません。
sandbox非対応/不安定時にClaude Codeが止まるためです。

## 代替防御
- PreToolUse safety_guard
- permissions.deny
- GitHub branch protection
- required checks
- push protection
- gitleaks / CodeQL / dependency review

## Windowsで追加ブロックするもの
- `type .env`
- `Get-Content .env`
- `gc .env`
- `set`
- `$env:`
- `python -c "print(os.environ)"`
- `node -e "console.log(process.env)"`
