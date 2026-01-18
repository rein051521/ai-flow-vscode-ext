"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitRoot = gitRoot;
exports.gitDiffNameOnly = gitDiffNameOnly;
exports.isWorkspaceClean = isWorkspaceClean;
exports.scanNestedGitDirs = scanNestedGitDirs;
exports.ensureRequiredFiles = ensureRequiredFiles;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const process_1 = require("./process");
const fs_1 = require("./fs");
async function gitRoot(workspaceRoot) {
    const r = await (0, process_1.execCapture)("git", ["rev-parse", "--show-toplevel"], workspaceRoot);
    if (r.exitCode !== 0)
        throw new Error("git rev-parse failed");
    return r.stdout.trim().replace(/\r?\n/g, "");
}
async function gitDiffNameOnly(repoRoot) {
    const r = await (0, process_1.execCapture)("git", ["diff", "--name-only"], repoRoot);
    return r.stdout;
}
async function isWorkspaceClean(repoRoot) {
    const r = await (0, process_1.execCapture)("git", ["status", "--porcelain"], repoRoot);
    return r.exitCode === 0 && r.stdout.trim().length === 0;
}
async function scanNestedGitDirs(workspaceRoot) {
    const bad = [];
    const rootGit = path.join(workspaceRoot, ".git");
    async function walk(dir, depth) {
        if (depth > 6)
            return;
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
        for (const [name, type] of entries) {
            if (type !== vscode.FileType.Directory)
                continue;
            const full = path.join(dir, name);
            if (name === ".git" && full !== rootGit) {
                bad.push(full);
                continue;
            }
            if (name === "node_modules" || name === ".venv" || name === ".git")
                continue;
            await walk(full, depth + 1);
        }
    }
    await walk(workspaceRoot, 0);
    return bad;
}
async function ensureRequiredFiles(repoRoot) {
    const req = [
        "scripts/validate_repo.py",
        "scripts/guard_worktree.py",
        "docs/prompts/AI_FLOW_CODEGEN_JA.md",
        "docs/prompts/AI_FLOW_DEBUG_JA.md",
        "docs/specs/FEATURE_TASKS_TEMPLATE_JA.yaml",
        "docs/specs/FEATURE_SPEC_TEMPLATE.md",
    ];
    const missing = [];
    for (const rel of req) {
        const u = vscode.Uri.file(path.join(repoRoot, rel));
        if (!(await (0, fs_1.exists)(u)))
            missing.push(rel);
    }
    return missing;
}
//# sourceMappingURL=git.js.map