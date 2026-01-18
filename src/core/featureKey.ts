const WINDOWS_RESERVED = new Set([
  "con","prn","aux","nul",
  "com1","com2","com3","com4","com5","com6","com7","com8","com9",
  "lpt1","lpt2","lpt3","lpt4","lpt5","lpt6","lpt7","lpt8","lpt9"
]);

export function validateFeatureKey(input: string): string[] {
  const s = input.trim();
  const errs: string[] = [];
  if (!s) errs.push("featureKey が空です。");
  if (s.length > 80) errs.push("featureKey が長すぎます（80文字以内）。");
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s)) {
    errs.push("featureKey は slug 形式（例: my-feature-1）。先頭末尾は英数字、途中は英数字かハイフンのみ。");
  }
  if (s.endsWith(".") || s.endsWith(" ")) errs.push("featureKey の末尾に '.' または空白は不可です。");
  if (WINDOWS_RESERVED.has(s.toLowerCase())) errs.push("Windows予約語のため featureKey に使えません。");
  if (s.includes("--")) errs.push("featureKey に連続ハイフンは不可です。");
  return errs;
}
