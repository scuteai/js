import { defineConfig } from "tsup";

// Everything this package exports is a hook or a component that needs the
// browser, so the bundle starts with "use client": a Next.js App Router
// page can import ScuteSignIn straight from a server component file.
export default defineConfig({
  banner: { js: '"use client";' },
});
