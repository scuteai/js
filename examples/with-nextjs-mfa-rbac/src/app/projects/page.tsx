import { requireUser } from "@/lib/session";

// Sample data. A real app loads this from its own database.
const PROJECTS = [
  { id: "p_website", name: "Website redesign" },
  { id: "p_mobile", name: "Mobile app" },
  { id: "p_billing", name: "Billing migration" },
];

// Protected like /account: signed-out visitors go to the sign-in first.
export default async function ProjectsPage() {
  await requireUser("/projects");

  // TODO(RBAC): decide on the server what this person may do, with Scute
  // roles and permissions: "projects:view" to see the list, "projects:edit"
  // to change a project, "projects:admin" to delete one or manage members.
  // Until then everyone signed in gets every action.
  const can = { view: true, edit: true, admin: true };

  if (!can.view) return <p>You don&apos;t have access to projects.</p>;

  return (
    <section className="stack">
      <h1>Projects</h1>
      <p className="muted">Signed-in people only. Roles and permissions come next.</p>
      <ul className="methods">
        {PROJECTS.map((p) => (
          <li key={p.id} className="method">
            <div className="method-head">
              <strong>{p.name}</strong>
              <div className="row">
                <button type="button" className="secondary">
                  View
                </button>
                {/* TODO(RBAC): only with "projects:edit". */}
                {can.edit && (
                  <button type="button" className="secondary">
                    Edit
                  </button>
                )}
                {/* TODO(RBAC): only with "projects:admin". */}
                {can.admin && (
                  <button type="button" className="secondary danger">
                    Delete
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
