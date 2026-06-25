import "dotenv/config";
import express from "express";
import { AccessToken } from "livekit-server-sdk";

// Mints a LiveKit join token that stamps the user's Scute identity (+ token, so
// the agent resolves permissions LIVE) into the participant attributes. In a
// real app you'd authenticate the user via Scute here and look up their roles +
// access token rather than trusting the request body.
const app = express();
app.use(express.json());

app.post("/token", async (req, res) => {
  const { room = "support", userId, roles = [], scuteToken = "" } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId required" });

  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: String(userId),
  });
  at.addGrant({ roomJoin: true, room });
  at.attributes = {
    scute_user_id: String(userId),
    scute_roles: Array.isArray(roles) ? roles.join(",") : String(roles),
    scute_kind: "user",
    scute_token: String(scuteToken),
  };

  res.json({ token: await at.toJwt(), url: process.env.LIVEKIT_URL });
});

const port = Number(process.env.TOKEN_SERVER_PORT || 3100);
app.listen(port, () => console.log(`token server on :${port}`));
