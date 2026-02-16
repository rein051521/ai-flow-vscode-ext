# AI Flow (local)

AI Flow is a VS Code extension that provides a simple wizard UI for:
- Creating FEATURE_SPEC / TASKS from templates
- Saving a session / Task Pack outside the repo
- Running repository gates (validate_repo etc.) and keeping evidence

## Packaging (VSIX)
- `npm ci`
- `npm run build`
- `npm run package:vsix` (normal)
- `npm run package:vsix:quiet` (suppresses Node warnings; recommended on Node 24+)

> Note: `package.json` uses `repository: "file:."` by default.
> If you publish publicly, set a proper repository URL.
