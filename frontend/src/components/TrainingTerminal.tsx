import React, { useEffect, useRef, useState } from "react";
import { Terminal, Maximize2, Minimize2 } from "lucide-react";

import { streamTrainingLog, type TrainingEvent } from "../lib/api";

interface TrainingTerminalProps {
  jobId: string;
  className?: string;
  /** Called once the stream closes, so the parent can refresh the job. */
  onComplete?: () => void;
}

interface LogLine {
  text: string;
  tone: "info" | "metric" | "error" | "success";
}

/** Turn a training event into one readable line. */
function format(event: TrainingEvent): LogLine {
  switch (event.stage) {
    case "initializing":
      return { text: "Job received. Preparing the run…", tone: "info" };
    case "task_resolved":
      return { text: `Task resolved: ${event.task}`, tone: "info" };
    case "resolved":
      return { text: `Base model ${event.model} · dataset ${event.dataset}`, tone: "info" };
    case "dataset_fallback":
      return {
        text: `Dataset ${event.from} was unavailable; falling back to ${event.to}`,
        tone: "info",
      };
    case "data_ready":
      return {
        text: `Data ready: ${event.train_rows} training rows, ${event.eval_rows} for evaluation`,
        tone: "info",
      };
    case "training_started":
      return { text: "Training started", tone: "info" };
    case "training": {
      const parts = [`step ${event.step ?? "?"}`];
      if (typeof event.epoch === "number") parts.push(`epoch ${event.epoch.toFixed(2)}`);
      if (typeof event.loss === "number") parts.push(`loss ${event.loss.toFixed(4)}`);
      return { text: parts.join(" · "), tone: "metric" };
    }
    case "evaluating":
      return { text: "Evaluating on the held-out split…", tone: "info" };
    case "saving":
      return { text: "Saving the checkpoint and tokenizer", tone: "info" };
    case "publishing":
      return { text: "Publishing to the Hugging Face Hub…", tone: "info" };
    case "published":
      return { text: `Published to ${event.repo_id}`, tone: "success" };
    case "publish_failed":
      return { text: `Model trained, but publishing failed: ${event.error}`, tone: "error" };
    case "completed": {
      const accuracy =
        typeof event.eval_accuracy === "number"
          ? ` · accuracy ${(event.eval_accuracy * 100).toFixed(1)}%`
          : "";
      return { text: `Training complete${accuracy}`, tone: "success" };
    }
    case "failed":
      return { text: `Failed: ${event.error}`, tone: "error" };
    default:
      return { text: event.msg ?? JSON.stringify(event), tone: "info" };
  }
}

const TONE_CLASS: Record<LogLine["tone"], string> = {
  info: "text-muted-foreground",
  metric: "text-foreground",
  error: "text-destructive",
  success: "text-success",
};

/** Live view of a training job's log. */
export const TrainingTerminal: React.FC<TrainingTerminalProps> = ({
  jobId,
  className = "",
  onComplete,
}) => {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jobId) return;

    setLines([{ text: "Connecting to the training log…", tone: "info" }]);
    setStreaming(true);

    // The server closes the stream when the job reaches a terminal state, so
    // there is nothing to reconnect to afterwards.
    const stop = streamTrainingLog(jobId, {
      onEvent: (event) => setLines((prev) => [...prev, format(event)]),
      onEnd: () => {
        setStreaming(false);
        onComplete?.();
      },
      onError: (error) => {
        setLines((prev) => [
          ...prev,
          { text: `Lost the log stream: ${String(error)}`, tone: "error" },
        ]);
        setStreaming(false);
      },
    });

    return stop;
    // onComplete is intentionally excluded: a parent passing an inline closure
    // would otherwise tear down and restart the stream on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  return (
    <div
      className={`overflow-hidden rounded-lg border border-border bg-card font-mono text-sm ${className} ${
        expanded ? "fixed inset-4 z-50" : "relative h-64"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span className="text-xs font-medium tracking-wide text-foreground">Training log</span>
          {streaming && (
            <span className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              live
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Collapse the log" : "Expand the log"}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="h-[calc(100%-40px)] space-y-1 overflow-y-auto p-4 text-xs md:text-sm"
      >
        {lines.map((line, index) => (
          <div key={index} className="break-words">
            <span className="mr-2 select-none text-muted-foreground/60">›</span>
            <span className={TONE_CLASS[line.tone]}>{line.text}</span>
          </div>
        ))}
        {streaming && <span className="inline-block h-4 w-2 animate-pulse bg-primary/50 align-middle" />}
      </div>
    </div>
  );
};
