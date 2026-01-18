# ai-flow-vscode-ext

AI Flow Wizard (Template-First + Schema-First + Webview UI)

## What it does
- Wizard input (QuickPick/InputBox) -> validates with Zod (no guessing)
- Generates previews (Spec / Tasks / Codegen Prompt / Debug Prompt) from **workspace canonical templates** (ai-dev-template)
- Stores all artifacts + Evidence Packs under VS Code **globalStorageUri** (repo stays clean)
- Runs Gate: `scripts/validate_repo.py --mode full --strict-clean` (stops if repo is dirty)
- Optional Export: copies artifacts to `docs/work/<featureKey>/` (warns it may dirty the repo)

## Constraints
- PowerShell is not used by this extension.
- Nested `.git` under the workspace root is treated as a hard-stop.
- If required files/templates are missing, the wizard stops and lists missing items.

## Commands
- `AI Flow: Open Wizard` (command id: `aiFlow.open`)

## Settings
- `aiFlow.pythonCommand` (default: `py`)
- `aiFlow.pythonArgs` (default: `['-3.12']`)

## Build & package (CMD / Git Bash)

```bash
npm install
npm run compile
npx vsce package
```

Notes:
- `npm ci` requires `package-lock.json`. If you don’t have it yet (or it is out-of-sync), run `npm install` once to (re)generate it, then commit the lock file.
- `npm audit fix --force` may introduce breaking changes. Prefer reviewing `npm audit` output and updating dependencies intentionally.
