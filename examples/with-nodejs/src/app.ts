import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import {
  createClient,
  authenticateRequest,
  scuteAuthMiddleware,
  type AuthenticatedRequest,
  InvalidAuthTokenError,
} from "@scute/node";

const scute = createClient({
  appId: process.env.SCUTE_APP_ID as string,
  baseUrl: process.env.SCUTE_BASE_URL as string,
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Hello world!");
});

app.get("/authenticated-route", async (req, res) => {
  try {
    const user = await authenticateRequest(req, scute);
    res.send(user);
  } catch (e) {
    // failed to authenticate
    res.status(401).send("Could not authenticate user!");
  }
});

app.get(
  "/authenticated-route-middleware",
  scuteAuthMiddleware(scute),
  async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    res.send(user);
  }
);

app.use(((error, req, res, next) => {
  if (error instanceof InvalidAuthTokenError) {
    res.status(401).json({
      error: "Could not authenticate user!",
    });
  }
  next();
}) as express.ErrorRequestHandler);

app.listen(5000, () => {
  console.log("Listening to 5000");
});
