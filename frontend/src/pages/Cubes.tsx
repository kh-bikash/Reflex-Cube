import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { CUBES, type CubeMeta } from "../lib/cubes";
import { cn } from "../lib/utils";

const CATEGORIES = ["All", "Generative", "Analysis", "Vision", "Security", "Productivity"] as const;
type Category = (typeof CATEGORIES)[number];

const Cubes: React.FC = () => {
  const [category, setCategory] = useState<Category>("All");

  const visible = useMemo(
    () => (category === "All" ? CUBES : CUBES.filter((cube) => cube.category === category)),
    [category],
  );

  return (
    <div className="page py-12">
      <header className="max-w-2xl">
        <h1 className="text-title">Intelligence Cubes</h1>
        <p className="mt-3 text-muted-foreground">
          Each cube is a self-contained capability with its own console. They share one
          dispatch endpoint, so anything you can do here you can also do from the API.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {CATEGORIES.map((option) => {
          const active = option === category;
          const count =
            option === "All"
              ? CUBES.length
              : CUBES.filter((cube) => cube.category === option).length;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option}
              <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <ul className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((cube) => (
          <CubeCard key={cube.id} cube={cube} />
        ))}
      </ul>
    </div>
  );
};

const CubeCard: React.FC<{ cube: CubeMeta }> = ({ cube }) => (
  <li>
    <Link
      to={`/cube/${cube.id}`}
      className="group flex h-full flex-col bg-card p-5 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">{cube.title}</h2>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {cube.category}
        </span>
      </div>

      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{cube.tagline}</p>

      <div className="mt-4 flex items-center justify-between">
        <code className="text-xs text-muted-foreground">{cube.id}</code>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Open
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    </Link>
  </li>
);

export default Cubes;
