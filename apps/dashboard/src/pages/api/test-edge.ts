import { scuteClient } from "@/scute";
import { authenticateRequest } from "@scute-edge";
import type { NextRequest } from "next/server";

export const config = {
  runtime: "edge",
};

export default async (request: NextRequest) => {
  const { data: user, error } = await authenticateRequest(request, scuteClient);
  return new Response(user);
};
