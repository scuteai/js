import { requireUser } from "@/lib/session";
import { checkProject, recentDecisions } from "@/lib/authz";
import { listProjects } from "@/lib/projects";
import { ProjectList } from "./project-list";

// Protected like /account, and checked: the server asks Scute whether this
// person may view projects before it renders any.
export default async function ProjectsPage() {
  const user = await requireUser("/projects");
  const view = await checkProject(user.id, "view");

  if (!view.allowed) {
    return (
      <section className="stack">
        <h1>Projects</h1>
        <p className="error">{view.explanation ?? "You don't have access to projects."}</p>
      </section>
    );
  }

  const decisions = await recentDecisions(user.id);

  return (
    <section className="stack">
      <h1>Projects</h1>
      <p className="muted">
        Your roles: <strong>{view.roles?.join(", ") || "none"}</strong>. Viewers see the list; editors can also
        rename a project.
      </p>
      <ProjectList projects={listProjects()} />

      <h2>Recent decisions about you</h2>
      <p className="muted">From the app&apos;s decision log in Scute. New ones show up a few seconds after each check.</p>
      {decisions.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="list decisions">
          {decisions.map((d) => (
            <li key={d.id}>
              <span className={d.decision === "deny" ? "error" : undefined}>{d.decision}</span>{" "}
              <code>{d.permission}</code>: {d.explanation}{" "}
              <span className="muted">({new Date(d.at).toLocaleTimeString()})</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
