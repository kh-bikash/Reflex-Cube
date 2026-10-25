import { lazy, type LazyExoticComponent, type ComponentType } from "react";

/**
 * Single source of truth for the Intelligence Cube catalog.
 *
 * `id` must match the cube id registered in `backend/app/cubes/registry.py`, since
 * it is what `POST /api/cubes/run` dispatches on and what `/cube/:id` routes to.
 *
 * Consoles are lazy-loaded: each cube UI is a sizeable standalone app, and eagerly
 * importing all of them pushed the whole catalog into the initial bundle.
 */
export interface CubeMeta {
  id: string;
  title: string;
  tagline: string;
  category: "Generative" | "Analysis" | "Vision" | "Security" | "Productivity";
  /** Tailwind gradient stops used by the hub cards. */
  gradient: string;
  /**
   * How the backend serves this cube:
   * - `registry` — a `Cube` subclass handles a structured `input` payload and returns a dict.
   * - `agent` — free-text prompt handled by the ReflexBrain agent loop, which returns markdown.
   */
  runtime: "registry" | "agent";
  console: LazyExoticComponent<ComponentType>;
}

/** Narrows a module whose cube is a named export into a default-export module. */
const named = <K extends string>(
  loader: () => Promise<Record<K, ComponentType>>,
  key: K,
) => lazy(() => loader().then((m) => ({ default: m[key] })));

export const CUBES: readonly CubeMeta[] = [
  {
    id: "forge",
    title: "Forge Cube",
    tagline: "Design, train and sample a NanoGPT language model from scratch.",
    category: "Generative",
    runtime: "registry",
    gradient: "from-orange-400 to-amber-600",
    console: lazy(() => import("../components/cubes/ForgeCube")),
  },
  {
    id: "vision",
    title: "Vision Cube",
    tagline: "Build an image classifier: label data, augment, train, inspect.",
    category: "Vision",
    runtime: "registry",
    gradient: "from-violet-400 to-fuchsia-600",
    console: named(() => import("../components/cubes/VisionCube"), "VisionCube"),
  },
  {
    id: "dream",
    title: "Dream Cube",
    tagline: "Train a generative image model and sample from its latent space.",
    category: "Generative",
    runtime: "registry",
    gradient: "from-pink-400 to-rose-600",
    console: named(() => import("../components/cubes/DreamCube"), "DreamCube"),
  },
  {
    id: "chef",
    title: "Chef Cube",
    tagline: "Photograph your ingredients, get a safety check and a full recipe.",
    category: "Vision",
    runtime: "registry",
    gradient: "from-orange-400 to-red-500",
    console: named(() => import("../components/cubes/ChefCube"), "ChefCube"),
  },
  {
    id: "alpha",
    title: "Alpha Cube",
    tagline: "Live market metrics with a valuation rating and an investment thesis.",
    category: "Analysis",
    runtime: "registry",
    gradient: "from-emerald-400 to-green-600",
    console: named(() => import("../components/cubes/AlphaCube"), "AlphaCube"),
  },
  {
    id: "nexus",
    title: "Nexus Cube",
    tagline: "A persistent semantic memory you can write to and recall from.",
    category: "Productivity",
    runtime: "registry",
    gradient: "from-indigo-400 to-purple-600",
    console: named(() => import("../components/cubes/NexusCube"), "NexusCube"),
  },
  {
    id: "lens",
    title: "Lens Cube",
    tagline: "OCR an image and get clean, summarised text back.",
    category: "Vision",
    runtime: "registry",
    gradient: "from-blue-400 to-cyan-500",
    console: named(() => import("../components/cubes/LensCube"), "LensCube"),
  },
  {
    id: "sentinel",
    title: "Sentinel Cube",
    tagline: "Inspect traffic for SQLi, XSS and flooding, and manage WAF rules.",
    category: "Security",
    runtime: "registry",
    gradient: "from-green-500 to-emerald-700",
    console: lazy(() => import("../components/cubes/SentinelCube")),
  },
  {
    id: "legal",
    title: "Legal Cube",
    tagline: "Score a contract for compliance and surface its liabilities.",
    category: "Analysis",
    runtime: "registry",
    gradient: "from-slate-400 to-slate-600",
    console: lazy(() => import("../components/cubes/LegalCube")),
  },
  {
    id: "ledger",
    title: "Ledger Cube",
    tagline: "Reconcile invoices against a bank feed and flag discrepancies.",
    category: "Analysis",
    runtime: "registry",
    gradient: "from-teal-400 to-cyan-700",
    console: lazy(() => import("../components/cubes/LedgerCube")),
  },
  {
    id: "talent",
    title: "Talent Cube",
    tagline: "Turn a job description into scoring criteria, then screen candidates.",
    category: "Productivity",
    runtime: "registry",
    gradient: "from-sky-400 to-indigo-600",
    console: lazy(() => import("../components/cubes/TalentCube")),
  },
  {
    id: "career",
    title: "Career Cube",
    tagline: "Map a growth path and rewrite a resume to clear ATS filters.",
    category: "Productivity",
    runtime: "registry",
    gradient: "from-amber-400 to-orange-600",
    console: lazy(() => import("../components/cubes/CareerCube")),
  },
  {
    id: "brand",
    title: "Brand Cube",
    tagline: "Generate naming, copy and identity guidelines for a brand.",
    category: "Generative",
    runtime: "registry",
    gradient: "from-fuchsia-400 to-pink-600",
    console: lazy(() => import("../components/cubes/BrandCube")),
  },
  {
    id: "fitpal",
    title: "FitPal Cube",
    tagline: "Build a training plan around your biometrics and goals.",
    category: "Productivity",
    runtime: "registry",
    gradient: "from-lime-400 to-green-600",
    console: lazy(() => import("../components/cubes/FitPalCube")),
  },
  {
    id: "travel",
    title: "Travel Cube",
    tagline: "Plan an itinerary with budget, weather and day-by-day routing.",
    category: "Productivity",
    runtime: "registry",
    gradient: "from-sky-400 to-blue-700",
    console: lazy(() => import("../components/cubes/TravelCube")),
  },
  {
    id: "research",
    title: "Research Cube",
    tagline: "Autonomous OSINT: search the web, scrape sources, synthesise a report.",
    category: "Analysis",
    runtime: "agent",
    gradient: "from-blue-400 to-indigo-600",
    console: named(() => import("../components/cubes/ResearchCube"), "ResearchCube"),
  },
  {
    id: "social",
    title: "Social Cube",
    tagline: "Profile and summarise public social presence from scraped sources.",
    category: "Analysis",
    runtime: "agent",
    gradient: "from-rose-400 to-purple-600",
    console: named(() => import("../components/cubes/SocialCube"), "SocialCube"),
  },
  {
    id: "legacy",
    title: "Legacy Cube",
    tagline: "Preserve and query long-form personal and family history.",
    category: "Productivity",
    runtime: "registry",
    gradient: "from-stone-400 to-amber-700",
    console: lazy(() => import("../components/cubes/LegacyCube")),
  },
] as const;

const BY_ID = new Map(CUBES.map((cube) => [cube.id, cube]));

export const getCube = (id: string | undefined): CubeMeta | undefined =>
  id ? BY_ID.get(id) : undefined;

export const CUBE_IDS: readonly string[] = CUBES.map((cube) => cube.id);
