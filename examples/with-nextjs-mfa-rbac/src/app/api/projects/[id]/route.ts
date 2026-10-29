// PATCH /api/projects/:id { name, stepUp?: { token, code } }
//
// The real check. Hiding the Edit button only tidies the page; this handler
// is what stops a viewer, whatever the browser sends.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@scute/nextjs-handlers";
import { checkProject, startStepUp, verifyStepUp } from "@/lib/authz";
import { renameProject } from "@/lib/projects";

type Body = { name?: unknown; stepUp?: { token?: unknown; code?: unknown } };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Who is asking: the session cookie, checked by Scute.
  const scute = createRouteHandlerClient({ cookies });
  const { data } = await scute.getUser();
  const user = data?.user;
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Give the project a name." }, { status: 422 });

  // A step-up in progress: the user sends back the challenge token with the
  // code we emailed. A wrong code ends here.
  let challenge: string | undefined;
  if (typeof body.stepUp?.token === "string" && typeof body.stepUp?.code === "string") {
    if (!(await verifyStepUp(body.stepUp.token, body.stepUp.code))) {
      return NextResponse.json({ error: "That code didn't work." }, { status: 403 });
    }
    challenge = body.stepUp.token;
  }

  const decision = await checkProject(user.id, "edit", challenge);

  if (decision.decision === "allow_with_step_up") {
    // Allowed once they verify: email them a code, and tell the page to ask for it.
    const token = await startStepUp(user.id, decision);
    if (!token) return NextResponse.json({ error: "Couldn't start the verification." }, { status: 502 });
    return NextResponse.json({ error: "Verify it's you first.", stepUp: { token } }, { status: 403 });
  }

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.explanation ?? "You can't edit projects." }, { status: 403 });
  }

  const { id } = await params;
  const project = renameProject(id, name);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  return NextResponse.json({ project });
}
