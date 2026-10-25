import React, { useState } from "react";
import { ExternalLink } from "lucide-react";

import {
  Alert,
  Button,
  Field,
  Input,
  Panel,
  PanelHeader,
} from "../components/ui/primitives";
import { ApiError, auth as authApi } from "../lib/api";
import { useAuth } from "../lib/auth";

const Settings: React.FC = () => {
  const { user, refresh } = useAuth();

  return (
    <div className="page py-12">
      <header className="mb-8">
        <h1 className="text-title">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="text-foreground">{user?.email}</span>
        </p>
      </header>

      <div className="space-y-6">
        <ProfileSection onSaved={refresh} />
        <HubTokenSection hasToken={Boolean(user?.has_hf_token)} onSaved={refresh} />
        <PasswordSection />
      </div>
    </div>
  );
};

/** Shared save-state handling for the three independent sections. */
function useSaveState() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const run = async (action: () => Promise<void>, successText: string) => {
    setSaving(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: successText });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof ApiError ? error.message : "Could not save. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return { saving, message, run };
}

const ProfileSection: React.FC<{ onSaved: () => Promise<void> }> = ({ onSaved }) => {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const { saving, message, run } = useSaveState();

  return (
    <Panel>
      <PanelHeader title="Profile" description="How you appear in the application." />
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await authApi.updateProfile({ display_name: displayName });
            await onSaved();
          }, "Profile updated.");
        }}
      >
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Field label="Display name" htmlFor="display-name" className="max-w-sm">
          <Input
            id="display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
          />
        </Field>
        <Button type="submit" variant="secondary" loading={saving}>
          Save
        </Button>
      </form>
    </Panel>
  );
};

const HubTokenSection: React.FC<{ hasToken: boolean; onSaved: () => Promise<void> }> = ({
  hasToken,
  onSaved,
}) => {
  const [token, setToken] = useState("");
  const { saving, message, run } = useSaveState();

  return (
    <Panel>
      <PanelHeader
        title="Hugging Face token"
        description="Publish the models you train to your own Hub account."
      />
      <div className="space-y-4 p-5">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          With a write token, each finished model is pushed to a repository under your
          account, along with a model card recording the prompt, base model, dataset
          and metrics. Without one, models are kept on the server, where a restart can
          remove them.{" "}
          <a
            href="https://huggingface.co/settings/tokens"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            Create a token
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </p>

        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await authApi.updateProfile({ hf_token: token });
              setToken("");
              await onSaved();
            }, token ? "Token saved." : "Token removed.");
          }}
        >
          <Field
            label="Write token"
            htmlFor="hf-token"
            hint={
              hasToken
                ? "A token is stored. Enter a new one to replace it, or save an empty field to remove it."
                : "Starts with hf_. Stored securely and never shown again."
            }
            className="max-w-md"
          >
            <Input
              id="hf-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={hasToken ? "••••••••••••••••" : "hf_…"}
              autoComplete="off"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" loading={saving}>
              {token ? "Save token" : hasToken ? "Remove token" : "Save token"}
            </Button>
          </div>
        </form>
      </div>
    </Panel>
  );
};

const PasswordSection: React.FC = () => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const { saving, message, run } = useSaveState();

  return (
    <Panel>
      <PanelHeader title="Password" />
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await authApi.updateProfile({ current_password: current, new_password: next });
            setCurrent("");
            setNext("");
          }, "Password changed.");
        }}
      >
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Field label="Current password" htmlFor="current-password" className="max-w-sm">
          <Input
            id="current-password"
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <Field
          label="New password"
          htmlFor="new-password"
          hint="At least 8 characters."
          className="max-w-sm"
        >
          <Input
            id="new-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" loading={saving}>
          Change password
        </Button>
      </form>
    </Panel>
  );
};

export default Settings;
