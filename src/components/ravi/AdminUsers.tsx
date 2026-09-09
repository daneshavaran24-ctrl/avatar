import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2, Plus, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAdminUsers,
  createAdminUser,
  deleteAdminUser,
} from "@/lib/ravi/auth.functions";

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AdminUsers() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminUsers);
  const createFn = useServerFn(createAdminUser);
  const deleteFn = useServerFn(deleteAdminUser);

  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listFn(),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (data: { email: string; password: string; role: "admin" | "user" }) =>
      createFn({ data }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setEmail("");
      setPassword("");
      setRole("admin");
      setShowForm(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setConfirmDeleteId(null);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">مدیران سامانه</h2>
          <p className="text-sm text-muted-foreground">
            افزودن، مشاهده و حذف حساب‌های مدیریتی
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "انصراف" : (
            <>
              <UserPlus className="size-4" />
              افزودن مدیر
            </>
          )}
        </Button>
      </div>

      {showForm && (
        <form
          className="rounded-2xl glass-panel p-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate({ email, password, role });
          }}
        >
          <h3 className="font-medium">ثبت مدیر جدید</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-email">ایمیل</Label>
              <Input
                id="new-email"
                type="email"
                dir="ltr"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-surface-2 text-left"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">گذرواژه (حداقل ۱۲ کاراکتر)</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  dir="ltr"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-surface-2 pl-10 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 left-2 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:max-w-xs">
            <Label>نقش</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user")}>
              <SelectTrigger className="bg-surface-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">مدیر</SelectItem>
                <SelectItem value="user">کاربر</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {createMut.isError && (
            <p className="rounded-xl bg-destructive/15 px-4 py-2 text-sm text-destructive-foreground">
              {createMut.error instanceof Error ? createMut.error.message : "خطا در ساخت حساب"}
            </p>
          )}

          <Button type="submit" disabled={createMut.isPending} className="self-start">
            {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            ثبت
          </Button>
        </form>
      )}

      {users.isLoading && (
        <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
      )}

      {users.isError && (
        <p className="rounded-xl bg-destructive/15 px-4 py-2 text-sm text-destructive-foreground">
          خطا در دریافت لیست مدیران
        </p>
      )}

      {users.data && users.data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl glass-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">ایمیل</th>
                <th className="px-4 py-3 font-medium">نقش</th>
                <th className="px-4 py-3 font-medium">تاریخ ساخت</th>
                <th className="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs" dir="ltr">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      u.role === "admin"
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {u.role === "admin" ? "مدیر" : "کاربر"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {confirmDeleteId === u.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(u.id)}
                        >
                          {deleteMut.isPending ? <Loader2 className="size-3 animate-spin" /> : "حذف"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          لغو
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(u.id)}
                      >
                        <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                    {deleteMut.isError && confirmDeleteId === u.id && (
                      <p className="mt-1 text-xs text-destructive-foreground">
                        {deleteMut.error instanceof Error ? deleteMut.error.message : "خطا"}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {users.data && users.data.length === 0 && (
        <p className="text-sm text-muted-foreground">هیچ مدیری ثبت نشده است.</p>
      )}
    </div>
  );
}
