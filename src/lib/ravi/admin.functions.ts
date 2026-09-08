import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  avatarSelectionSchema,
  connectionKeySchema,
  elevenVoiceSchema,
  managedKeyNameSchema,
  openRouterModelSchema,
  persianVoicePreferenceSchema,
  saveKeySchema,
  settingsSchema,
  toggleServiceSchema,
} from "./validators";
import { deleteStoredKey, saveStoredKey } from "./keystore.server";
import {
  connectionOverview,
  listSettingsVersions,
  restoreSettingsVersion,
  saveAvatarSelection,
  saveOpenRouterModel,
  testConnection,
  toggleService,
} from "./connections.server";
import { listHeygenAvatars, listHeygenVoices } from "./heygen.server";
import {
  adminDeleteDocument,
  adminIngestPdf,
  adminListConversation,
  adminListDocuments,
  adminListSessions,
  adminOverview,
  adminReindexDocument,
  adminUpdateSettings,
  readSettings,
} from "./admin-actions.server";
import { assertAdmin } from "./admin.server";

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return readSettings();
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminUpdateSettings(data);
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminListDocuments();
  });

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("فایلی ارسال نشد.");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("فایل PDF معتبر نیست.");
    const title = String(data.get("title") || file.name).slice(0, 200);
    return { file, title };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminIngestPdf(data.file, data.title);
  });

export const removeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => String(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminDeleteDocument(data);
  });

export const reindexDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => String(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminReindexDocument(data);
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminListSessions();
  });

export const listConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => String(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminListConversation(data);
  });

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return adminOverview();
  });

export const getConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return connectionOverview();
  });

export const checkConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => connectionKeySchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return testConnection(data);
  });

export const listAvatarLooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [avatars, voices] = await Promise.all([listHeygenAvatars(), listHeygenVoices()]);
    return { avatars, voices };
  });

export const selectAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => avatarSelectionSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return saveAvatarSelection(data, context.userId);
  });

export const setOpenRouterModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => openRouterModelSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return saveOpenRouterModel(data, context.userId);
  });

export const setServiceEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => toggleServiceSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return toggleService(data, context.userId);
  });

export const listSettingsHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return listSettingsVersions();
  });

export const restoreSettingsHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => String(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return restoreSettingsVersion(data, context.userId);
  });

export const saveProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveKeySchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return saveStoredKey(data.name, data.value);
  });

export const removeProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => managedKeyNameSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    return deleteStoredKey(data);
  });
export const listElevenVoicesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { listElevenVoices } = await import("./elevenlabs.server");
    return listElevenVoices();
  });

export const diagnoseElevenLabsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { diagnoseElevenLabs } = await import("./elevenlabs.server");
    return diagnoseElevenLabs();
  });


export const selectElevenVoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => elevenVoiceSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { saveElevenVoice } = await import("./elevenlabs.server");
    return saveElevenVoice(data);
  });

/** Copies the best native Persian voice from the ElevenLabs library. */
export const activatePersianVoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => persianVoicePreferenceSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { activatePersianLibraryVoice } = await import("./elevenlabs.server");
    return activatePersianLibraryVoice(data.prefer);
  });
