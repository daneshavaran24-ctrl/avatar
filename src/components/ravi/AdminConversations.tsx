import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listConversation, listSessions } from "@/lib/ravi/admin.functions";
import { SOURCE_LABELS, type SourceType } from "@/lib/ravi/types";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AdminConversations() {
  const sessionsFn = useServerFn(listSessions);
  const messagesFn = useServerFn(listConversation);
  const [selected, setSelected] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: ["admin", "sessions"],
    queryFn: () => sessionsFn(),
  });

  const messages = useQuery({
    queryKey: ["admin", "conversation", selected],
    queryFn: () => messagesFn({ data: selected! }),
    enabled: Boolean(selected),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="rounded-2xl glass-panel p-3">
        <h3 className="px-2 py-1 text-sm font-semibold">نشست‌های گفتگو</h3>
        <ScrollArea className="mt-2 h-[480px]">
          <div className="flex flex-col gap-1 pl-2">
            {sessions.data?.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">نشستی ثبت نشده است.</p>
            )}
            {sessions.data?.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelected(session.id)}
                className={cn(
                  "rounded-xl px-3 py-2 text-right text-xs transition-colors",
                  selected === session.id
                    ? "bg-primary/20 text-foreground"
                    : "hover:bg-surface-2 text-muted-foreground",
                )}
              >
                {dateFormatter.format(new Date(session.started_at))}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="rounded-2xl glass-panel p-4">
        {!selected && (
          <p className="py-10 text-center text-xs text-muted-foreground">
            برای مشاهدهٔ متن گفتگو، یک نشست را انتخاب کنید.
          </p>
        )}
        <ScrollArea className="h-[480px]">
          <div className="flex flex-col gap-3 pl-2">
            {messages.data?.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[90%] rounded-2xl px-4 py-2 text-sm leading-7",
                  message.role === "user"
                    ? "self-start bg-surface-2"
                    : "self-end bg-primary/10",
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {message.source_type && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {SOURCE_LABELS[message.source_type as SourceType] ?? message.source_type}
                    </Badge>
                  )}
                  {message.latency_ms != null && <span>{message.latency_ms} میلی‌ثانیه</span>}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}