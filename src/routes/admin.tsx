import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminBehavior } from "@/components/ravi/AdminBehavior";
import { AdminConversations } from "@/components/ravi/AdminConversations";
import { AdminKnowledge } from "@/components/ravi/AdminKnowledge";
import { AdminConnections } from "@/components/ravi/AdminConnections";
import { AdminUsers } from "@/components/ravi/AdminUsers";
import { getOverview } from "@/lib/ravi/admin.functions";
import { SOURCE_LABELS, type SourceType } from "@/lib/ravi/types";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "پنل مدیریت | راوی‌استان" },
      {
        name: "description",
        content:
          "مدیریت پایگاه دانش، رفتار پاسخ‌گویی و بایگانی گفتگوهای دستیار هوشمند راوی‌استان.",
      },
      { property: "og:title", content: "پنل مدیریت | راوی‌استان" },
      {
        property: "og:description",
        content: "بارگذاری اسناد، تنظیم لحن و سیاست‌ها و مرور گفتگوهای دستیار راوی‌استان.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  return (
    <main className="ambient-backdrop min-h-screen">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-2xl glass-panel p-4">
          <div>
            <h1 className="text-2xl font-bold text-gradient-accent">پنل مدیریت راوی‌استان</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              پایگاه دانش، رفتار پاسخ‌گویی و بایگانی گفتگوها
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowRight className="size-4" />
              بازگشت به دستیار
            </Link>
          </Button>
        </header>

        <Overview />

        <Tabs defaultValue="knowledge" dir="rtl">
          <TabsList className="glass-panel">
            <TabsTrigger value="knowledge">پایگاه دانش</TabsTrigger>
            <TabsTrigger value="behavior">رفتار و سیاست‌ها</TabsTrigger>
            <TabsTrigger value="conversations">گفتگوها</TabsTrigger>
            <TabsTrigger value="connections">کلیدها و آواتار</TabsTrigger>
            <TabsTrigger value="users">مدیران</TabsTrigger>
          </TabsList>
          <TabsContent value="knowledge" className="mt-4">
            <AdminKnowledge />
          </TabsContent>
          <TabsContent value="behavior" className="mt-4">
            <AdminBehavior />
          </TabsContent>
          <TabsContent value="conversations" className="mt-4">
            <AdminConversations />
          </TabsContent>
          <TabsContent value="connections" className="mt-4">
            <AdminConnections />
          </TabsContent>
          <TabsContent value="users" className="mt-4">
            <AdminUsers />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function Overview() {
  const overviewFn = useServerFn(getOverview);
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => overviewFn() });

  if (overview.isError) {
    return (
      <p className="rounded-2xl bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100/80">
        آمار در دسترس نیست؛ اتصال به دیتابیس برقرار نشد. بقیهٔ پنل کار می‌کند —
        جزئیات خطا در تب «کلیدها و آواتار» نمایش داده می‌شود.
      </p>
    );
  }

  // An outage yields zeroes from empty result sets; showing them as real counts
  // would be a measurement we never took.
  const data = overview.data?.dbAvailable ? overview.data : undefined;
  const statsOffline = overview.isSuccess && !overview.data?.dbAvailable;
  const cards = [
    { label: "نشست‌های گفتگو", value: data?.sessionCount ?? "—" },
    { label: "پاسخ‌های تولیدشده", value: data?.answerCount ?? "—" },
    {
      label: "میانهٔ زمان پاسخ",
      value: data?.medianLatencyMs != null ? `${data.medianLatencyMs} ms` : "—",
    },
    { label: "قطعه‌های دانش", value: data?.chunkCount ?? "—" },
    { label: "خطای سرویس‌دهنده", value: data ? `${data.providerErrorRate}٪` : "—" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {statsOffline && (
        <p className="rounded-2xl bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100/80">
          آمار در دسترس نیست؛ اتصال به دیتابیس برقرار نشد. بقیهٔ پنل کار می‌کند —
          جزئیات خطا در تب «کلیدها و آواتار» نمایش داده می‌شود.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card, index) => (
          <div
            key={card.label}
            className="animate-fade-in rounded-2xl glass-panel p-4 transition-shadow hover:shadow-[0_0_24px_-6px_oklch(0.55_0.25_285_/_18%)]"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-xl font-semibold text-gradient-accent">{card.value}</p>
          </div>
        ))}
      </div>
      {data && Object.keys(data.bySource).length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {Object.entries(data.bySource).map(([source, count]) => (
            <span key={source} className="rounded-full bg-surface-2 px-3 py-1">
              {SOURCE_LABELS[source as SourceType] ?? source}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}