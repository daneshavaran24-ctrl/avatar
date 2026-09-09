import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SOURCE_LABELS, type TranscriptTurn } from "@/lib/ravi/types";
import { cn } from "@/lib/utils";

const SOURCE_STYLE: Record<string, string> = {
  KNOWLEDGE_BASE: "border-transparent bg-primary/15 text-violet",
  HYBRID: "border-transparent bg-violet/15 text-violet",
  GENERAL_AI: "border-border bg-surface-2 text-muted-foreground",
  POLICY_BLOCK: "border-transparent bg-destructive/15 text-destructive-foreground",
};

export function Transcript({ turns, pending }: { turns: TranscriptTurn[]; pending: boolean }) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, pending]);

  return (
    <ScrollArea className="h-full w-full">
      <div className="flex flex-col gap-3 p-4">
        {turns.length === 0 && !pending && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            گفتگو هنوز آغاز نشده است. پرسش خود را بنویسید یا دکمهٔ میکروفون را نگه دارید.
          </p>
        )}

        {turns.map((turn) => (
          <div
            key={turn.id}
            className={cn(
              "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7",
              turn.role === "user"
                ? "self-start bg-surface-2 text-foreground"
                : "self-end glass-panel text-foreground",
            )}
          >
            <p className="whitespace-pre-wrap">{turn.content}</p>
            {turn.sourceType && (
              <Badge
                className={cn("mt-2 text-[11px] font-normal", SOURCE_STYLE[turn.sourceType])}
                variant="outline"
              >
                {SOURCE_LABELS[turn.sourceType]}
              </Badge>
            )}
          </div>
        ))}

        {pending && (
          <div className="self-end rounded-2xl px-4 py-3 text-sm text-muted-foreground">
            در حال آماده‌سازی پاسخ…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}