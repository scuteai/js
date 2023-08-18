import { ScuteHandler } from "@scute/nextjs";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  return ScuteHandler(req, res);
}