import type { NextApiRequest, NextApiResponse } from "next";
import { authenticateRequest } from "@scute/nodejs";
import { scute } from "../../scute";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { data: user, error } = await authenticateRequest(req, scute);
  res.status(200).json(user);
}