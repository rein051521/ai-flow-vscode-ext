"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execCapture = execCapture;
const child_process_1 = require("child_process");
async function execCapture(cmd, args, cwd) {
    return await new Promise((resolve, reject) => {
        const p = (0, child_process_1.spawn)(cmd, args, { cwd, windowsHide: true });
        let out = "";
        p.stdout.on("data", (d) => (out += d.toString("utf8")));
        p.stderr.on("data", (d) => (out += d.toString("utf8")));
        p.on("error", (e) => reject(e));
        p.on("close", (code) => resolve({ exitCode: typeof code === "number" ? code : 1, stdout: out }));
    });
}
//# sourceMappingURL=process.js.map