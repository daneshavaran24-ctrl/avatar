import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileText, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  listDocuments,
  removeDocument,
  reindexDocumentFn,
  uploadDocument,
} from "@/lib/ravi/admin.functions";

const STATUS_LABELS: Record<string, string> = {
  PROCESSING: "در حال پردازش",
  READY: "آماده",
  FAILED: "ناموفق",
};

export function AdminKnowledge() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listDocuments);
  const uploadFn = useServerFn(uploadDocument);
  const deleteFn = useServerFn(removeDocument);
  const reindexFn = useServerFn(reindexDocumentFn);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const documents = useQuery({
    queryKey: ["admin", "documents"],
    queryFn: () => listFn(),
  });

  const upload = useMutation({
    mutationFn: async (form: FormData) => uploadFn({ data: form }),
    onSuccess: () => {
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const mutate = useMutation({
    mutationFn: async ({ action, id }: { action: "delete" | "reindex"; id: string }) =>
      action === "delete" ? deleteFn({ data: id }) : reindexFn({ data: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "documents"] }),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl glass-panel p-5">
        <h3 className="text-sm font-semibold">افزودن سند PDF به پایگاه دانش</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          متن سند استخراج، قطعه‌بندی و بردارسازی می‌شود تا در پاسخ‌ها مورد استناد قرار گیرد.
          فایل‌های تصویری اسکن‌شده پشتیبانی نمی‌شوند.
        </p>

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const file = fileRef.current?.files?.[0];
            if (!file) {
              setError("لطفاً یک فایل PDF انتخاب کنید.");
              return;
            }
            const form = new FormData();
            form.append("file", file);
            form.append("title", title || file.name);
            upload.mutate(form);
          }}
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="عنوان سند (اختیاری)"
            className="bg-surface-2"
          />
          <Input ref={fileRef} type="file" accept="application/pdf" className="bg-surface-2" />
          <Button type="submit" disabled={upload.isPending}>
            {upload.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            بارگذاری و پردازش
          </Button>
        </form>

        {error && <p className="mt-3 text-xs text-destructive-foreground">{error}</p>}
      </section>

      <section className="rounded-2xl glass-panel p-5">
        <h3 className="text-sm font-semibold">اسناد موجود</h3>
        <div className="mt-4 flex flex-col gap-3">
          {documents.isLoading && (
            <p className="text-xs text-muted-foreground">در حال دریافت فهرست…</p>
          )}
          {documents.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">هنوز سندی بارگذاری نشده است.</p>
          )}
          {documents.data?.map((document) => (
            <div
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm">{document.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {document.chunk_count} قطعه
                    {document.error_message ? ` — ${document.error_message}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{STATUS_LABELS[document.status] ?? document.status}</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="بازسازی نمایه"
                  onClick={() => mutate.mutate({ action: "reindex", id: document.id })}
                >
                  <RefreshCw className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="حذف سند"
                  onClick={() => mutate.mutate({ action: "delete", id: document.id })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}