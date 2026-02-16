export type FailStep =
  | "guard-pre"
  | "gate"
  | "strict-clean"
  | "templates"
  | "unknown";

export type TroubleCard = {
  id: string;
  title: string;
  symptoms: string[];
  likelyCauses: string[];
  fixSteps: string[];
  verify: string[];
};

export function classifyFailStep(failLineOrErr: string | null): FailStep {
  if (!failLineOrErr) return "unknown";
  const s = failLineOrErr;
  if (s.includes("dirty") || s.includes("作業ツリーがdirty")) return "strict-clean";
  if (s.includes("guard-pre")) return "guard-pre";
  if (s.includes("gate")) return "gate";
  if (s.includes("テンプレ") || s.includes("template")) return "templates";
  return "unknown";
}

export function getTroubleCards(step: FailStep): TroubleCard[] {
  const common: TroubleCard[] = [
    {
      id: "common-view-logs",
      title: "ログ（証跡）を見る",
      symptoms: ["何が起きたか分からない", "どこで失敗したか分からない"],
      likelyCauses: ["ログの参照場所が不明", "エラーの要点が見えていない"],
      fixSteps: [
        "VS Code左のAI Flow → 実行履歴（Run History）を開く",
        "最新の NG をクリックして meta.json を開く",
        "stdout.txt / stderr.txt を確認して FAIL(...) の行を探す"
      ],
      verify: ["FAIL(...) のステップ名（guard-pre / gate 等）が特定できる"]
    }
  ];

  const strictClean: TroubleCard[] = [
    {
      id: "strict-clean",
      title: "strict-cleanで止まる（dirty）",
      symptoms: ["Gate実行前に 'dirty' と出る", "git status が空でない"],
      likelyCauses: ["未コミット変更がある", "生成物が追跡外で残っている"],
      fixSteps: [
        "ターミナルで `git status --porcelain` を実行し、変更ファイルを確認",
        "不要なら `git checkout -- <path>` / `git clean -fd` で元に戻す（危険なので対象を必ず確認）",
        "必要な変更ならコミットしてからGateを実行"
      ],
      verify: ["`git status --porcelain` が空になり、Gateが開始する"]
    }
  ];

  const guardPre: TroubleCard[] = [
    {
      id: "guard-pre",
      title: "guard-preで失敗（ガード違反）",
      symptoms: ["FAIL(guard-pre) が出る", "AllowedPrefixes 違反と出る"],
      likelyCauses: ["許可されていないパスに変更がある", "docs_packの規約違反"],
      fixSteps: [
        "stdout/stderr の AllowedPrefixes と違反パスを確認",
        "変更ファイルを許可パス配下に移す（例: docs/ や scripts/ など）",
        "どうしても必要なら guard_worktree の許可リストを仕様に沿って更新（要レビュー）"
      ],
      verify: ["guard-pre が PASS になる"]
    }
  ];

  const gate: TroubleCard[] = [
    {
      id: "gate",
      title: "Gate（validate_repo）が失敗",
      symptoms: ["FAIL(gate) が出る", "pytest/ruff/mypy 等で落ちる"],
      likelyCauses: ["テスト失敗", "静的解析の指摘", "依存関係不足"],
      fixSteps: [
        "stderr.txt の最初のエラー箇所を読む（最上流が原因のことが多い）",
        "ローカルで同じコマンドを再実行して再現する（meta.jsonの argv を使う）",
        "指摘に沿って修正→再度Gate"
      ],
      verify: ["exitCode=0 かつ ok=true になる"]
    }
  ];

  const templates: TroubleCard[] = [
    {
      id: "templates",
      title: "テンプレが見つからない",
      symptoms: ["テンプレが見つかりません", "workspace側のプロンプトが無い"],
      likelyCauses: ["docs/prompts のパス違い", "設定が別のワークスペースを指している"],
      fixSteps: [
        "ai-dev-template の `docs/prompts/AI_FLOW_CODEGEN_JA.md` と `AI_FLOW_DEBUG_JA.md` が存在するか確認",
        "VS Code設定 `aiFlow.templates.canonical*` を既定に戻す",
        "fallbackPolicy が deny の場合は prompt/allow にするか、canonicalを用意する"
      ],
      verify: ["テンプレの読み込みが ok になる"]
    }
  ];

  if (step === "strict-clean") return [...strictClean, ...common];
  if (step === "guard-pre") return [...guardPre, ...common];
  if (step === "gate") return [...gate, ...common];
  if (step === "templates") return [...templates, ...common];
  return common;
}
