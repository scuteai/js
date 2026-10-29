// Sample data, kept in memory while the server runs. A real app loads this
// from its own database.

export type Project = { id: string; name: string };

// On globalThis so the page and the route handler share one list (Next.js
// can load this module once per route).
const store = globalThis as typeof globalThis & { exampleProjects?: Project[] };
const projects: Project[] = (store.exampleProjects ??= [
  { id: "p_website", name: "Website redesign" },
  { id: "p_mobile", name: "Mobile app" },
  { id: "p_billing", name: "Billing migration" },
]);

export function listProjects(): Project[] {
  return projects.map((p) => ({ ...p }));
}

export function renameProject(id: string, name: string): Project | null {
  const project = projects.find((p) => p.id === id);
  if (!project) return null;
  project.name = name;
  return { ...project };
}
