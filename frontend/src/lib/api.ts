/**
 * Typed client for the Reflex Cube API.
 *
 * `VITE_API_URL` is baked in at build time. Leave it empty to call the app's
 * own origin, which is what the Vite dev proxy and the production nginx config
 * both arrange — same-origin means SSE and cookies work with no CORS setup.
 * Set it to an absolute URL when the API lives on another host (a Vercel
 * frontend against a Hugging Face Space, say).
 */

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").trim();

/** Base URL with any trailing slash removed, so `${BASE}/api/x` is well-formed. */
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

const TOKEN_KEY = "reflexcube.token";

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

let memoryToken: string | null = null;

/**
 * Reading localStorage throws in a sandboxed iframe and in Safari's private
 * mode, so every access is guarded and falls back to a module-level value that
 * lasts for the page session.
 */
export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable; the in-memory copy still serves this page */
  }
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

/** An API error carrying the status code and the server's message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the server says we are not (or no longer) signed in. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Listeners notified when the server rejects our token, so the UI can sign out. */
const authFailureHandlers = new Set<() => void>();

export function onAuthFailure(handler: () => void): () => void {
  authFailureHandlers.add(handler);
  return () => authFailureHandlers.delete(handler);
}

function extractMessage(status: number, body: unknown): string {
  if (typeof body === "string" && body) return body;
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    // FastAPI validation errors arrive as a list of {loc, msg}.
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: string; loc?: unknown[] };
      const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : undefined;
      return field ? `${field}: ${first.msg ?? "invalid"}` : (first.msg ?? "Invalid request");
    }
  }
  return `Request failed (${status})`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (cause) {
    // fetch only rejects on a network-level failure, which for a deployed app
    // usually means the API host is down, asleep, or blocked by CORS.
    throw new ApiError(0, "Could not reach the API. Check your connection and try again.", cause);
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      setToken(null);
      authFailureHandlers.forEach((handler) => handler());
    }
    throw new ApiError(response.status, extractMessage(response.status, body), body);
  }

  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });
const patch = <T>(path: string, data: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(data) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  created_at?: string;
  has_hf_token: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export type JobStatusValue =
  | "queued"
  | "initializing"
  | "analyzing_prompt"
  | "loading_data"
  | "training"
  | "completed"
  | "failed"
  | "cancelled";

export interface Job {
  id: string;
  name: string;
  prompt: string;
  task: string;
  status: JobStatusValue;
  progress: number;
  epoch: number;
  loss: number | null;
  accuracy: number | null;
  model_name: string | null;
  dataset_name: string | null;
  result_path: string | null;
  hub_repo_id: string | null;
  error: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Health {
  status: string;
  version: string;
  database: string;
  cubes: number;
  storage_path: string;
  auth_required: boolean;
  registration_open: boolean;
  training_available: boolean;
  model_publishing: boolean;
}

export interface CubeInfo {
  id: string;
  name: string;
  description: string;
}

/** Events streamed by `GET /api/logs/:id` while a job runs. */
export interface TrainingEvent {
  stage: string;
  msg?: string;
  step?: number;
  epoch?: number;
  loss?: number;
  error?: string;
  task?: string;
  model?: string;
  dataset?: string;
  repo_id?: string;
  url?: string;
  [key: string]: unknown;
}

/**
 * Loose shape for a cube payload.
 *
 * Each cube returns its own fields, so consoles index freely; `unknown` values
 * keep that honest without reaching for `any`.
 */
export type JsonObject = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Terminal job states — nothing further will happen to a job in one of these. */
export const TERMINAL_STATUSES: readonly JobStatusValue[] = ["completed", "failed", "cancelled"];

export const isTerminal = (status: JobStatusValue): boolean =>
  TERMINAL_STATUSES.includes(status);

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const auth = {
  register: (email: string, password: string, displayName?: string) =>
    post<AuthResponse>("/api/auth/register", {
      email,
      password,
      display_name: displayName || undefined,
    }),
  login: (email: string, password: string) =>
    post<AuthResponse>("/api/auth/login", { email, password }),
  me: () => get<UserProfile>("/api/auth/me"),
  updateProfile: (changes: {
    display_name?: string;
    hf_token?: string;
    current_password?: string;
    new_password?: string;
  }) => patch<UserProfile>("/api/auth/me", changes),
};

export const health = () => get<Health>("/api/health");

export const models = {
  create: (payload: { name: string; prompt: string; task?: string }) =>
    post<{ job_id: string; status: string }>("/api/models/create", payload),
  status: (jobId: string) => get<Job>(`/api/training/status/${jobId}`),
  list: () => get<Job[]>("/api/models/all"),
  remove: (jobId: string) => del<{ status: string; id: string }>(`/api/models/${jobId}`),
  predict: (jobId: string, text: string) =>
    post<{ result: unknown }>(`/api/models/${jobId}/predict`, { text }),
  downloadUrl: (jobId: string) => `${API_BASE}/api/models/download/${jobId}`,
};

export const cubes = {
  list: () => get<{ cubes: CubeInfo[]; count: number }>("/api/cubes"),
  run: <T = Record<string, unknown>>(cubeId: string, input: unknown) =>
    post<T>("/api/cubes/run", { cube_id: cubeId, input }),
};

export const newsletter = {
  subscribe: (email: string) =>
    post<{ status: string; email: string }>("/api/newsletter/subscribe", { email }),
};

/**
 * Download a model archive.
 *
 * `fetch` rather than a plain link, because the endpoint needs an
 * Authorization header and an `<a download>` cannot send one.
 */
export async function downloadModel(jobId: string, filename = `${jobId}.zip`): Promise<void> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(models.downloadUrl(jobId), { headers });
  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(response.status, await response.text()));
  }
  triggerDownload(await response.blob(), filename);
}

/** Render markdown to a PDF and save it. */
export async function downloadPdf(title: string, markdown: string): Promise<void> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}/api/cubes/pdf`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title, markdown }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(response.status, await response.text()));
  }
  triggerDownload(await response.blob(), `${title.replace(/\s+/g, "_")}.pdf`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Follow a training job's live log.
 *
 * `EventSource` cannot send an Authorization header, so this reads the SSE
 * stream over `fetch` instead. Returns a function that stops following.
 */
export function streamTrainingLog(
  jobId: string,
  handlers: {
    onEvent: (event: TrainingEvent) => void;
    onEnd?: () => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const controller = new AbortController();

  (async () => {
    const headers = new Headers({ Accept: "text/event-stream" });
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    try {
      const response = await fetch(`${API_BASE}/api/logs/${jobId}`, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new ApiError(response.status, `Log stream unavailable (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          let isEnd = false;
          const data: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) isEnd = line.slice(6).trim() === "end";
            else if (line.startsWith("data:")) data.push(line.slice(5).trim());
            // Lines starting with ':' are keep-alive comments.
          }
          if (isEnd) {
            handlers.onEnd?.();
            return;
          }
          const payload = data.join("\n");
          if (!payload) continue;
          try {
            handlers.onEvent(JSON.parse(payload) as TrainingEvent);
          } catch {
            /* a partial or malformed frame is not worth tearing the stream down */
          }
        }
      }
      handlers.onEnd?.();
    } catch (error) {
      if (controller.signal.aborted) return;
      handlers.onError?.(error);
    }
  })();

  return () => controller.abort();
}

/**
 * Generic escape hatch for callers that need a path this module does not wrap.
 *
 * Cube consoles use it with their own response shapes; the default keeps
 * untyped call sites indexable rather than `unknown`.
 */
export const api = {
  get: async <T = JsonObject>(endpoint: string) => ({
    data: await get<T>(`/api${endpoint}`),
  }),
  post: async <T = JsonObject>(endpoint: string, data?: unknown) => ({
    data: await post<T>(`/api${endpoint}`, data),
  }),
};

// ---------------------------------------------------------------------------
// Named helpers
//
// Thin wrappers kept so call sites read as verbs. They delegate to the
// grouped objects above, which are the canonical surface.
// ---------------------------------------------------------------------------

export const createModel = (payload: { name: string; prompt: string; task?: string }) =>
  models.create(payload);

export const getJobStatus = (jobId: string) => models.status(jobId);

export const getAllModels = () => models.list();

export const deleteModel = (jobId: string) => models.remove(jobId);

export const testModel = (jobId: string, text: string) => models.predict(jobId, text);

export const subscribeNewsletter = (email: string) => newsletter.subscribe(email);

/** Resolve the URL a completed model can be downloaded from. */
export const requestModelZip = async (jobId: string) =>
  post<{ url: string }>(`/api/models/download-zip/${jobId}`);
