import { z } from "zod";

export const FeatureKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]{1,48}$/, "featureKey must be lower-case [a-z0-9_-], 2-49 chars");

export const FlowStateSchema = z.object({
  featureKey: FeatureKeySchema,
  goal: z.string().trim().min(1, "goal is required"),
  projectKind: z.enum(["new", "change", "bugfix", "refactor"]),
  targetFiles: z.array(z.string().trim()).default([]),
});

export const TasksYamlSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      details: z.array(z.string().min(1)).default([]),
    })
  ),
});
