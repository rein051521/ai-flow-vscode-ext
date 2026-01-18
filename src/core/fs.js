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
exports.ensureDir = ensureDir;
exports.exists = exists;
exports.readText = readText;
exports.writeText = writeText;
exports.sha256Hex = sha256Hex;
exports.safeBasename = safeBasename;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
async function ensureDir(u) {
    await vscode.workspace.fs.createDirectory(u);
}
async function exists(u) {
    try {
        await vscode.workspace.fs.stat(u);
        return true;
    }
    catch {
        return false;
    }
}
async function readText(u) {
    const b = await vscode.workspace.fs.readFile(u);
    return Buffer.from(b).toString("utf-8");
}
async function writeText(u, text) {
    const b = Buffer.from(text, "utf-8");
    await vscode.workspace.fs.writeFile(u, b);
}
function sha256Hex(s) {
    return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
function safeBasename(featureKey) {
    const s = featureKey.trim();
    if (s.includes("/") || s.includes("\\") || s.includes("..")) {
        throw new Error("featureKey contains illegal path characters");
    }
    if (/[<>:"|?*]/.test(s))
        throw new Error("featureKey contains illegal Windows filename characters");
    if (/[.\s]$/.test(s))
        throw new Error("featureKey must not end with dot or whitespace");
    const reserved = new Set([
        "con", "prn", "aux", "nul",
        "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
        "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ]);
    if (reserved.has(s.toLowerCase()))
        throw new Error("featureKey is a reserved Windows name");
    return s;
}
//# sourceMappingURL=fs.js.map