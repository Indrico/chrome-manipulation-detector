import { z } from "zod";
import { patternIdSchema, type PatternId } from "../models/pattern";

export const settingsKey = "settings";

const categoriesSchema = z.partialRecord(patternIdSchema, z.boolean());
export const settingsSchema = z.strictObject({
  version: z.literal(1),
  enabled: z.boolean(),
  showAnnotations: z.boolean(),
  localModel: z.boolean().optional(),
  online: z.boolean().optional(),
  onlineProvider: z.literal("groq").optional(),
  categories: categoriesSchema,
});

export type Settings = z.infer<typeof settingsSchema>;

export const settingsMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("settings:get") }),
  z.strictObject({
    type: z.literal("settings:patch"),
    patch: settingsSchema
      .omit({ version: true, onlineProvider: true })
      .partial(),
  }),
  z.strictObject({ type: z.literal("settings:reset") }),
]);

export type SettingsMessage = z.infer<typeof settingsMessageSchema>;

export const settingsResponseSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), settings: settingsSchema }),
  z.strictObject({ ok: z.literal(false) }),
]);

export function defaultSettings(): Settings {
  return { version: 1, enabled: true, showAnnotations: true, categories: {} };
}

export function readSettings(value: unknown): Settings {
  const parsed = settingsSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultSettings();
}

export function applySettingsPatch(
  current: Settings,
  patch: Extract<SettingsMessage, { type: "settings:patch" }>["patch"],
): Settings {
  return {
    ...current,
    enabled: patch.enabled ?? current.enabled,
    showAnnotations: patch.showAnnotations ?? current.showAnnotations,
    ...(patch.localModel === undefined ? {} : { localModel: patch.localModel }),
    ...(patch.online === undefined ? {} : { online: patch.online }),
    categories: { ...current.categories, ...patch.categories },
  };
}

export function enabledPatterns(
  settings: Settings,
  available: readonly PatternId[],
): PatternId[] {
  return settings.enabled
    ? available.filter((patternId) => settings.categories[patternId] !== false)
    : [];
}
