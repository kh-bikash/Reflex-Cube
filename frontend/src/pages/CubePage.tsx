import React, { Suspense } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { Button, EmptyState, Spinner } from "../components/ui/primitives";
import { getCube } from "../lib/cubes";

const CubePage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const cube = getCube(id);

  if (!cube) {
    return (
      <div className="page py-12">
        <BackLink />
        <div className="mt-6 rounded-lg border border-border bg-card">
          <EmptyState
            title="No such cube"
            description={
              id
                ? `Nothing is registered under "${id}".`
                : "No cube was named in the address."
            }
            action={
              <Button onClick={() => navigate("/services")}>Browse the cubes</Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page flex flex-1 flex-col py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <BackLink />
          <div className="hidden h-4 w-px bg-border sm:block" />
          <div className="hidden sm:block">
            <h1 className="text-sm font-semibold">{cube.title}</h1>
            <p className="text-xs text-muted-foreground">{cube.tagline}</p>
          </div>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {cube.runtime === "agent" ? "Agent-backed" : cube.category}
        </span>
      </div>

      {/*
        Each console is a self-contained application with its own layout, so it
        gets a bordered frame with a minimum height rather than being asked to
        fit the page's rhythm.
      */}
      <section
        aria-label={`${cube.title} console`}
        className="min-h-[70vh] flex-1 overflow-hidden rounded-lg border border-border bg-card"
      >
        <Suspense fallback={<Spinner label={`Loading ${cube.title}`} className="min-h-[70vh]" />}>
          <cube.console />
        </Suspense>
      </section>
    </div>
  );
};

const BackLink: React.FC = () => (
  <Link
    to="/services"
    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
  >
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    All cubes
  </Link>
);

export default CubePage;
