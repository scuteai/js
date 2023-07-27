import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import {
  createClient,
  authenticateRequest,
  scuteAuthMiddleware,
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
  const { data: user } = await authenticateRequest(req, scute);
  res.send(user);
});

app.get(
  "/authenticated-route-middleware",
  scuteAuthMiddleware(scute),
  async (req, res) => {
    const user = (req as any).user;
    res.send(user);
  }
);

app.listen(5000, () => {
  console.log("Listening to 5000");
});
