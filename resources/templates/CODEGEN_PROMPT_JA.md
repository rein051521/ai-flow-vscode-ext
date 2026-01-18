# AI Flow CODEGEN (JA) fallback

このテンプレは workspace 側の canonical（docs/prompts/AI_FLOW_CODEGEN_JA.md）が無い場合のみ使われます。
原則は canonical を用意し、この fallback は最終手段です。

要件:
- 推測で断定しない。欠落は質問 or fail-closed。
- 変更ごとに `git diff --name-only` を確認。
- 最後に `scripts/validate_repo.py --mode {docs|full} --strict-clean` を通す。
