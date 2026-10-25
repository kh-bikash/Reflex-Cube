import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Boxes, GitBranch, LineChart, Terminal } from "lucide-react";

import { PipelineDiagram } from "../components/visuals/PipelineDiagram";
import { Button } from "../components/ui/primitives";
import { CUBES } from "../lib/cubes";
import { useAuth } from "../lib/auth";

const Home: React.FC = () => {
  const { user } = useAuth();

  return (
    <>
      <Hero signedIn={Boolean(user)} />
      <HowItWorks />
      <Capabilities />
      <CubeIndex />
      <ClosingCta signedIn={Boolean(user)} />
    </>
  );
};

const Hero: React.FC<{ signedIn: boolean }> = ({ signedIn }) => (
  <section className="border-b border-border">
    <div className="page grid items-center gap-14 py-20 lg:grid-cols-[1fr_1fr] lg:py-28">
      <div>
        <p className="eyebrow">Open-source model training</p>
        <h1 className="mt-4 text-display">Describe a model. Get a trained one.</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Write what you want in plain language. Reflex Cube works out the task,
          selects a base model and a real dataset from the Hugging Face Hub,
          fine-tunes it, and hands you back the weights.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            to={signedIn ? "/generate" : "/signup"}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {signedIn ? "Open the studio" : "Start training"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/documentation"
            className="inline-flex h-11 items-center rounded-md border border-border bg-card px-6 text-[15px] font-medium transition-colors hover:bg-muted"
          >
            Read the docs
          </Link>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Trains on real datasets, never synthetic placeholders. Every run reports
          its base model, dataset and evaluation metrics.
        </p>
      </div>

      <div className="lg:pl-4">
        <PromptExample />
      </div>
    </div>
  </section>
);

/** A worked example, rather than a decorative screenshot. */
const PromptExample: React.FC = () => (
  <figure className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
    <figcaption className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
      <Terminal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-xs font-medium text-muted-foreground">A run, end to end</span>
    </figcaption>

    <div className="space-y-5 p-5">
      <div>
        <p className="eyebrow">Your prompt</p>
        <p className="mt-2 rounded-md bg-muted/60 px-3 py-2.5 font-mono text-sm leading-relaxed text-foreground">
          classify movie reviews as positive or negative
        </p>
      </div>

      <div>
        <p className="eyebrow">What Reflex Cube resolved</p>
        <dl className="mt-2 divide-y divide-border text-sm">
          {[
            ["Task", "text-classification"],
            ["Base model", "distilbert-base-uncased"],
            ["Dataset", "imdb"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono text-[13px] text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <p className="eyebrow">Result</p>
        <div className="mt-2 flex items-baseline gap-6">
          <div>
            <span className="text-2xl font-semibold tabular-nums text-foreground">91.2%</span>
            <span className="ml-1.5 text-sm text-muted-foreground">accuracy</span>
          </div>
          <div>
            <span className="text-2xl font-semibold tabular-nums text-foreground">0.284</span>
            <span className="ml-1.5 text-sm text-muted-foreground">loss</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Illustrative figures from a representative run on the default sample size.
        </p>
      </div>
    </div>
  </figure>
);

const STEPS = [
  {
    title: "Interpret",
    body: "The prompt is reduced to a task and a set of search terms. An explicit task overrides the heuristic.",
  },
  {
    title: "Resolve",
    body: "The Hub is searched for a dataset matching the prompt and task. A curated corpus covers the cases where nothing suitable is found.",
  },
  {
    title: "Train",
    body: "Fine-tuning runs in its own process with a held-out split, streaming epoch and loss back to the browser as it goes.",
  },
  {
    title: "Keep",
    body: "Weights, tokenizer and metrics are saved, and pushed to your Hugging Face account when you connect one.",
  },
] as const;

const HowItWorks: React.FC = () => (
  <section className="border-b border-border">
    <div className="page py-20">
      <div className="max-w-2xl">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 text-title">Four steps, none of them yours</h2>
      </div>

      <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="font-mono text-xs text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-14">
        <PipelineDiagram />
      </div>
    </div>
  </section>
);

const CAPABILITIES = [
  {
    icon: LineChart,
    title: "Live training telemetry",
    body: "Loss and epoch stream from the training process to the browser over server-sent events, so you watch a run rather than poll it.",
  },
  {
    icon: GitBranch,
    title: "Models you keep",
    body: "Connect a Hugging Face token and each finished model is pushed to your own account with a model card recording how it was built.",
  },
  {
    icon: Boxes,
    title: "A registry of task cubes",
    body: "Beside the trainer: contract review, invoice reconciliation, OCR, image classification, traffic inspection — each with its own console and one shared endpoint.",
  },
] as const;

const Capabilities: React.FC = () => (
  <section className="border-b border-border bg-surface">
    <div className="page py-20">
      <div className="grid gap-12 lg:grid-cols-3">
        {CAPABILITIES.map(({ icon: Icon, title, body }) => (
          <div key={title}>
            <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <h3 className="mt-4 text-base font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const CubeIndex: React.FC = () => (
  <section className="border-b border-border">
    <div className="page py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="eyebrow">The registry</p>
          <h2 className="mt-3 text-title">Task-specific cubes</h2>
          <p className="mt-4 text-muted-foreground">
            Each one is a self-contained capability with its own console, reachable
            through a single dispatch endpoint.
          </p>
        </div>
        <Link
          to="/services"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Browse all {CUBES.length}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {CUBES.slice(0, 6).map((cube) => (
          <li key={cube.id}>
            <Link
              to={`/cube/${cube.id}`}
              className="flex h-full flex-col bg-card p-5 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold">{cube.title}</h3>
                <span className="shrink-0 text-xs text-muted-foreground">{cube.category}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{cube.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

const ClosingCta: React.FC<{ signedIn: boolean }> = ({ signedIn }) => (
  <section className="page py-20">
    <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-border bg-surface px-8 py-10 sm:flex-row sm:items-center">
      <div className="max-w-xl">
        <h2 className="text-xl font-semibold tracking-tight">
          {signedIn ? "Pick up where you left off" : "Train your first model"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {signedIn
            ? "Your models and training history are in your account."
            : "Creating an account is free, and a first run finishes in minutes."}
        </p>
      </div>
      <Link to={signedIn ? "/dashboard" : "/signup"} className="shrink-0">
        <Button size="lg">{signedIn ? "View your models" : "Create an account"}</Button>
      </Link>
    </div>
  </section>
);

export default Home;
