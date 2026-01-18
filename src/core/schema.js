"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksYamlSchema = exports.FlowStateSchema = exports.FeatureKeySchema = void 0;
const zod_1 = require("zod");
exports.FeatureKeySchema = zod_1.z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{1,48}$/, "featureKey must be lower-case [a-z0-9_-], 2-49 chars");
exports.FlowStateSchema = zod_1.z.object({
    featureKey: exports.FeatureKeySchema,
    goal: zod_1.z.string().trim().min(1, "goal is required"),
    projectKind: zod_1.z.enum(["new", "change", "bugfix", "refactor"]),
    targetFiles: zod_1.z.array(zod_1.z.string().trim()).default([]),
});
exports.TasksYamlSchema = zod_1.z.object({
    tasks: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        title: zod_1.z.string().min(1),
        details: zod_1.z.array(zod_1.z.string().min(1)).default([]),
    })),
});
//# sourceMappingURL=schema.js.map