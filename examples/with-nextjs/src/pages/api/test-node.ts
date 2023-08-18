import type { NextApiRequest, NextApiResponse } from "next";
import { authenticateRequest } from "@scute/node";
import { createPagesServerClient } from "@scute/nextjs";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const scute = createPagesServerClient({ req, res });
  
  const { data: user, error } = await authenticateRequest(req, scute);
  res.status(200).json(user);
}
