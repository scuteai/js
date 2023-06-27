import { scute } from "../../scute";
import { authenticateRequest } from "@scute/edge";
import { type NextRequest, NextResponse } from "next/server";

export const config = {
  runtime: "edge",
};

export default async function handler(request: NextRequest) {
  const { data: user, error } = await authenticateRequest(request, scute);
  return NextResponse.json(user);
}
