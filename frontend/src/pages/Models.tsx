import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink, Play, Plus, Trash2 } from "lucide-react";

import {
  Alert,
  Button,
  EmptyState,
  Input,
  Panel,
  PanelHeader,
  Progress,
  Skeleton,
  Status,
  type StatusTone,
} from "../components/ui/primitives";
import { ApiError, downloadModel, isTerminal, models, type Job } from "../lib/api";

const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "Queued",
  initializing: "Starting",
  analyzing_prompt: "Reading the prompt",
  loading_data: "Downloading data",
  training: "Training",
  completed: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<Job["status"], StatusTone> = {
  queued: "neutral",
  initializing: "running",
  analyzing_prompt: "running",
  loading_data: "running",
  training: "running",
  completed: "success",
  failed: "error",
  cancelled: "neutral",
};

/** Refresh interval while any job is still running. */
const POLL_MS = 4000;

const Models: React.FC = () => {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await models.list());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load your models.");
      setJobs((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while something is actually in flight, so an idle dashboard is
  // not making a request every few seconds forever.
  const hasRunning = useMemo(
    () => Boolean(jobs?.some((job) => !isTerminal(job.status))),
    [jobs],
  );
  useEffect(() => {
    if (!hasRunning) return;
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [hasRunning, load]);

  const remove = async (job: Job) => {
    if (!window.confirm(`Delete "${job.name}" and its weights? This cannot be undone.`)) return;
    // Optimistic: the row disappears at once, and a failure restores it.
    setJobs((current) => current?.filter((item) => item.id !== job.id) ?? null);
    try {
      await models.remove(job.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete that model.");
      void load();
    }
  };

  const running = jobs?.filter((job) => !isTerminal(job.status)) ?? [];
  const finished = jobs?.filter((job) => isTerminal(job.status)) ?? [];

  return (
    <div className="page py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title">Your models</h1>
          <p className="mt-2 text-muted-foreground">
            Every training run on this account, newest first.
          </p>
        </div>
        <Link to="/generate">
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New model
          </Button>
        </Link>
      </header>

      {error && (
        <Alert tone="error" className="mb-6">
          {error}
        </Alert>
      )}

      {jobs === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Panel>
          <EmptyState
            title="No models yet"
            description="Describe what you want in the studio and Reflex Cube will train it for you."
            action={
              <Link to="/generate">
                <Button>Open the studio</Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-8">
          {running.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">In progress</h2>
              <div className="space-y-3">
                {running.map((job) => (
                  <JobRow key={job.id} job={job} onDelete={remove} />
                ))}
              </div>
            </section>
          )}

          <section>
            {running.length > 0 && <h2 className="mb-3 text-sm font-semibold">Finished</h2>}
            <div className="space-y-3">
              {finished.map((job) => (
                <JobRow key={job.id} job={job} onDelete={remove} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

const JobRow: React.FC<{ job: Job; onDelete: (job: Job) => void }> = ({ job, onDelete }) => {
  const [open, setOpen] = useState(false);
  const running = !isTerminal(job.status);

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="truncate text-sm font-semibold">{job.name}</h3>
            <Status tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Status>
          </div>

          {job.prompt && (
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{job.prompt}</p>
          )}

          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt>Task</dt>
              <dd className="font-mono text-foreground">{job.task}</dd>
            </div>
            {job.model_name && (
              <div className="flex gap-1.5">
                <dt>Base</dt>
                <dd className="font-mono text-foreground">{job.model_name}</dd>
              </div>
            )}
            {job.dataset_name && (
              <div className="flex gap-1.5">
                <dt>Dataset</dt>
                <dd className="font-mono text-foreground">{job.dataset_name}</dd>
              </div>
            )}
            {job.accuracy != null && (
              <div className="flex gap-1.5">
                <dt>Accuracy</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {(job.accuracy * 100).toFixed(1)}%
                </dd>
              </div>
            )}
          </dl>

          {running && <Progress value={job.progress} className="mt-4 max-w-sm" />}

          {job.status === "failed" && job.error && (
            <p className="mt-3 font-mono text-xs text-destructive">{job.error.split("\n")[0]}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {job.status === "completed" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Test
              </Button>
              <DownloadButton job={job} />
              {job.hub_repo_id && (
                <a
                  href={`https://huggingface.co/${job.hub_repo_id}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="View on the Hugging Face Hub"
                  className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => onDelete(job)}
            aria-label={`Delete ${job.name}`}
            className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {open && job.status === "completed" && (
        <InferencePanel jobId={job.id} task={job.task} />
      )}
    </Panel>
  );
};

const DownloadButton: React.FC<{ job: Job }> = ({ job }) => {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadModel(job.id, `${job.name}.zip`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Download
    </Button>
  );
};

/** Inline inference against a finished model. */
const InferencePanel: React.FC<{ jobId: string; task: string }> = ({ jobId, task }) => {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await models.predict(jobId, text.trim());
      setResult(JSON.stringify(response.result, null, 2));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Inference failed.");
    } finally {
      setRunning(false);
    }
  };

  const placeholder =
    task === "summarization"
      ? "Paste a few paragraphs to summarise…"
      : task === "translation"
        ? "Enter a sentence to translate…"
        : "Enter some text to run through the model…";

  return (
    <div className="border-t border-border bg-surface p-5">
      <form onSubmit={run} className="flex flex-wrap gap-2">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          className="min-w-64 flex-1"
          aria-label="Inference input"
        />
        <Button type="submit" size="md" loading={running} disabled={!text.trim()}>
          Run
        </Button>
      </form>

      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      {result && (
        <pre className="scrollbar-thin mt-3 max-h-56 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground">
          {result}
        </pre>
      )}
    </div>
  );
};

export default Models;
