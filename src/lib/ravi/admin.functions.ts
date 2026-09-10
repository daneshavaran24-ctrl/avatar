import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "./admin.middleware";
import {
  avatarSelectionSchema,
  connectionKeySchema,
  managedKeyNameSchema,
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

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .handler(async () => {
    return readSettings();
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data }) => {
    return adminUpdateSettings(data);
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .handler(async () => {
    return adminListDocuments();
  });

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("فایلی ارسال نشد.");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("فایل PDF معتبر نیست.");
    const title = String(data.get("title") || file.name).slice(0, 200);
    return { file, title };
  })
  .handler(async ({ data }) => {
    return adminIngestPdf(data.file, data.title);
  });

export const removeDocument = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => String(data))
  .handler(async ({ data }) => {
    return adminDeleteDocument(data);
  });

export const reindexDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => String(data))
  .handler(async ({ data }) => {
    return adminReindexDocument(data);
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .handler(async () => {
    return adminListSessions();
  });

export const listConversation = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => String(data))
  .handler(async ({ data }) => {
    return adminListConversation(data);
  });

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .handler(async () => {
    return adminOverview();
  });

export const getConnections = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .handler(async () => {
    return connectionOverview();
  });

export const checkConnection = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => connectionKeySchema.parse(data))
  .handler(async ({ data }) => {
    return testConnection(data);
  });

export const listAvatarLooks = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .handler(async () => {
    const [avatars, voices] = await Promise.all([listHeygenAvatars(), listHeygenVoices()]);
    return { avatars, voices };
  });

export const selectAvatar = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => avatarSelectionSchema.parse(data))
  .handler(async ({ context, data }) => {
    return saveAvatarSelection(data, context.userId);
  });

export const setServiceEnabled = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => toggleServiceSchema.parse(data))
  .handler(async ({ context, data }) => {
    return toggleService(data, context.userId);
  });

export const listSettingsHistory = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .handler(async () => {
    return listSettingsVersions();
  });

export const restoreSettingsHistory = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => String(data))
  .handler(async ({ context, data }) => {
    return restoreSettingsVersion(data, context.userId);
  });

export const diagnoseDatabaseHealth = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .handler(async () => {
    const { sql } = await import("@/lib/db/client.server");
    const result: {
      dbConnected: boolean;
      dbError: string | null;
      providerKeysTableExists: boolean;
      storedKeyCount: number;
      hasKeySecret: boolean;
    } = {
      dbConnected: false,
      dbError: null,
      providerKeysTableExists: false,
      storedKeyCount: 0,
      hasKeySecret: Boolean(process.env["RAVI_KEY_SECRET"]),
    };

    try {
      await sql`SELECT 1`;
      result.dbConnected = true;
    } catch (error) {
      result.dbError = error instanceof Error ? error.message : String(error);
      return result;
    }

    try {
      const [row] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'provider_keys'
        ) AS exists
      `;
      result.providerKeysTableExists = row?.exists ?? false;
    } catch {
      return result;
    }

    if (result.providerKeysTableExists) {
      try {
        const [row] = await sql<{ count: string }[]>`
          SELECT count(*)::text FROM provider_keys
        `;
        result.storedKeyCount = Number(row?.count ?? 0);
      } catch {
        // count failed but table exists
      }
    }

    return result;
  });

export const saveProviderKey = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => saveKeySchema.parse(data))
  .handler(async ({ data }) => {
    return saveStoredKey(data.name, data.value);
  });

export const removeProviderKey = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => managedKeyNameSchema.parse(data))
  .handler(async ({ data }) => {
    return deleteStoredKey(data);
  });
