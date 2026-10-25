import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Download, ExternalLink } from "lucide-react";

import { TrainingTerminal } from "../components/TrainingTerminal";
import TrainingMonitor from "../components/TrainingMonitor";
import {
  Alert,
  Button,
  Field,
  Input,
  Metric,
  Panel,
  PanelHeader,
  Progress,
  Select,
  Status,
  Textarea,
  type StatusTone,
} from "../components/ui/primitives";
import { ApiError, downloadModel, isTerminal, models, type Job } from "../lib/api";
import { useAuth } from "../lib/auth";

/** Tasks the backend accepts, with plain-language labels. */
const TASKS = [
  { value: "auto", label: "Detect from the prompt" },
  { value: "text-classification", label: "Text classification" },
  { value: "token-classification", label: "Entity extraction" },
  { value: "summarization", label: "Summarisation" },
  { value: "translation", label: "Translation" },
  { value: "text-generation", label: "Text generation" },
  { value: "question-answering", label: "Question answering" },
] as const;

const EXAMPLES = [
  "Classify movie reviews as positive or negative",
  "Detect spam in email subject lines",
  "Summarise long news articles into a short paragraph",
  "Extract company and person names from text",
] as const;

const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "Queued",
  initializing: "Starting",
  analyzing_prompt: "Reading the prompt",
  loading_data: "Downloading the dataset",
  training: "Training",
  completed: "Complete",
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

/** How often to re-read the job row while a run is in flight. */
const POLL_MS = 2500;

const Studio: React.FC = () => {
  const { capabilities } = useAuth();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [task, setTask] = useState<string>("auto");

  const [job, setJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trainingUnavailable = capabilities?.training_available === false;

  const refreshJob = useCallback(async (jobId: string) => {
    try {
      setJob(await models.status(jobId));
    } catch {
      /* a transient read failure resolves on the next tick */
    }
  }, []);

  // The log stream carries progress while a run is live; this keeps the metric
  // row and the terminal state in step with the database.
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!job || isTerminal(job.status)) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      return;
    }
    pollRef.current = window.setInterval(() => void refreshJob(job.id), POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [job, refreshJob]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const { job_id } = await models.create({
        // A model needs a name; derive a readable one rather than making the
        // field mandatory.
        name: name.trim() || derivedName(prompt),
        prompt: prompt.trim(),
        task: task === "auto" ? undefined : task,
      });
      await refreshJob(job_id);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not start the training run.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page py-12">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-title">Studio</h1>
        <p className="mt-3 text-muted-foreground">
          Describe the model you want. Reflex Cube picks the task, base model and
          dataset, then trains it.
        </p>
      </header>

      {trainingUnavailable && (
        <Alert tone="warning" title="Training is unavailable on this deployment" className="mb-6">
          The server is running without the machine-learning stack installed, so jobs
          will fail. The cube consoles still work.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        <Panel>
          <PanelHeader title="New model" />
          <form onSubmit={submit} className="space-y-5 p-5">
            {error && <Alert tone="error">{error}</Alert>}

            <Field
              label="What should it do?"
              htmlFor="prompt"
              hint="One sentence is enough."
            >
              <Textarea
                id="prompt"
                required
                rows={4}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Classify movie reviews as positive or negative"
              />
            </Field>

            <div>
              <p className="mb-2 text-xs text-muted-foreground">Or start from an example:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Name" htmlFor="name" hint="Optional — derived from the prompt if blank.">
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={prompt ? derivedName(prompt) : "review-sentiment"}
                maxLength={120}
              />
            </Field>

            <Field label="Task" htmlFor="task">
              <Select id="task" value={task} onChange={(event) => setTask(event.target.value)}>
                {TASKS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Button
              type="submit"
              size="lg"
              loading={submitting}
              disabled={!prompt.trim()}
              className="w-full"
            >
              Start training
            </Button>
          </form>
        </Panel>

        <div className="space-y-6">
          {job ? (
            <RunPanel job={job} onRefresh={() => void refreshJob(job.id)} />
          ) : (
            <Panel className="flex min-h-[320px] items-center justify-center p-10 text-center">
              <div className="max-w-sm">
                <h2 className="text-sm font-semibold">Nothing training yet</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Start a run and this panel will show the resolved task, base model and
                  dataset, live loss, and the finished weights.
                </p>
                <Link
                  to="/dashboard"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  See your earlier models
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
};

const RunPanel: React.FC<{ job: Job; onRefresh: () => void }> = ({ job, onRefresh }) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const running = !isTerminal(job.status);

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadModel(job.id, `${job.name}.zip`);
    } catch (error) {
      setDownloadError(
        error instanceof ApiError ? error.message : "Could not download the model.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Panel>
        <PanelHeader
          title={job.name}
          description={<span className="font-mono text-xs">{job.id}</span>}
          actions={<Status tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Status>}
        />

        <div className="space-y-5 p-5">
          {running && <Progress value={job.progress} label={STATUS_LABEL[job.status]} />}

          {job.status === "failed" && job.error && (
            <Alert tone="error" title="This run failed">
              <span className="font-mono text-xs">{job.error.split("\n")[0]}</span>
            </Alert>
          )}

          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Metric label="Task" value={<span className="text-sm">{job.task}</span>} />
            <Metric
              label="Base model"
              value={<span className="text-sm">{job.model_name ?? "—"}</span>}
            />
            <Metric
              label="Dataset"
              value={<span className="text-sm">{job.dataset_name ?? "—"}</span>}
            />
            <Metric
              label="Accuracy"
              value={job.accuracy != null ? `${(job.accuracy * 100).toFixed(1)}%` : "—"}
              hint={job.loss != null ? `loss ${job.loss.toFixed(4)}` : undefined}
            />
          </dl>

          {job.status === "completed" && (
            <div className="space-y-3 border-t border-border pt-5">
              {downloadError && <Alert tone="error">{downloadError}</Alert>}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={download} loading={downloading}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download weights
                </Button>
                {job.hub_repo_id && (
                  <a
                    href={`https://huggingface.co/${job.hub_repo_id}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    View on the Hub
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
                <Link
                  to="/dashboard"
                  className="inline-flex h-9 items-center gap-1.5 px-2 text-sm font-medium text-primary hover:underline"
                >
                  Test it
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
              {!job.hub_repo_id && (
                <p className="text-xs text-muted-foreground">
                  Connect a Hugging Face token in{" "}
                  <Link to="/settings" className="text-primary hover:underline">
                    settings
                  </Link>{" "}
                  to keep models permanently in your own account.
                </p>
              )}
            </div>
          )}
        </div>
      </Panel>

      <TrainingMonitor jobId={job.id} />
      <TrainingTerminal jobId={job.id} onComplete={onRefresh} />
    </>
  );
};

/** Turn a prompt into a short, readable model name. */
function derivedName(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .slice(0, 3);
  return words.join("-") || "model";
}

const STOPWORDS = new Set([
  "the", "and", "for", "from", "that", "this", "with", "into", "build", "create",
  "train", "make", "model", "using", "based",
]);

export default Studio;
