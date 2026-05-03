# GitHub Branch Protection

## 必須設定
対象: main / master / release/* / develop

- Require a pull request before merging
- Require status checks to pass before merging
- Require branches to be up to date before merging または Require merge queue
- Require merge queue
- Do not allow force pushes
- Do not allow deletions
- Enable secret scanning
- Enable push protection
- Enable CodeQL/code scanning where available

## Required checks候補
- quality
- gitleaks
- verify-autopilot-pack
- analyze
