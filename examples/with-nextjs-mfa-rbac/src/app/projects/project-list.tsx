"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCan } from "@scute/react-hooks";
import type { Project } from "@/lib/projects";

/**
 * The list. The Edit buttons show only to people who may edit: useCan asks
 * Scute about the signed-in user from the browser (the app must allow
 * client checks). That only tidies the page; PATCH /api/projects/:id checks
 * again on the server.
 */
export function ProjectList({ projects }: { projects: Project[] }) {
  // allowed: a plain allow. needsStepUp: allowed after a fresh email code.
  const { allowed, needsStepUp, loading } = useCan("edit", "project");
  const canEdit = allowed || needsStepUp;

  return (
    <ul className="methods">
      {projects.map((p) => (
        <ProjectRow key={p.id} project={p} canEdit={canEdit} loading={loading} />
      ))}
    </ul>
  );
}

function ProjectRow({ project, canEdit, loading }: { project: Project; canEdit: boolean; loading: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [stepUp, setStepUp] = useState<{ token: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stepUp: stepUp ? { token: stepUp.token, code } : undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (res.ok) {
      setEditing(false);
      setStepUp(null);
      setCode("");
      router.refresh();
    } else if (body.stepUp) {
      // The server emailed a code; ask for it, then save again with it.
      setStepUp(body.stepUp);
      setCode("");
    } else {
      setError(body.error ?? "Couldn't save.");
      if (stepUp) setCode("");
    }
  }

  return (
    <li className="method">
      <div className="method-head">
        <strong>{project.name}</strong>
        <div className="row">
          {loading ? null : canEdit ? (
            !editing && (
              <button type="button" className="secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
            )
          ) : (
            <span className="badge">View only</span>
          )}
        </div>
      </div>

      {editing && (
        <form className="stack" onSubmit={save}>
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          {stepUp && (
            <label className="field">
              Editing needs a fresh check. Enter the code we just emailed you.
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="submit" disabled={busy}>
              {stepUp ? "Verify and save" : "Save"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditing(false);
                setStepUp(null);
                setError(null);
                setName(project.name);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
