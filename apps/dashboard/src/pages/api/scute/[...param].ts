// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import { deleteCookie } from "cookies-next";

const app_id = process.env.NEXT_PUBLIC_SCUTE_APP_ID;
const app_domain = process.env.NEXT_PUBLIC_SCUTE_APP_DOMAIN;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("Q:", (req as any).query.param[0]);

  const access_token = req.cookies["sc-access-token"];
  const refresh_token = req.cookies["sc-refresh-token"];
  const csrf = req.cookies["X-CSRF-Token"];

  if ((req as any).query.param[0] === "refresh") {
    // scute.refresh
    try {
      const result = await refresh(refresh_token as string, csrf as string);
      console.log(result.data);
      res.status(200).json(result);
    } catch (error) {
      console.log("REFRESH EERORR: ", error);
      scuteLogout(req, res);
    }
  } else if ((req as any).query.param[0] === "logout") {
    scuteLogout(req, res);
  } else {
    console.log(req.query);
    console.log(resolveQuery(req.query.param));
    const url = resolveQuery(req.query.param);
    const result = await scuteNode(access_token, refresh_token, csrf).get(url);
    console.log("API RESULT :", result);
    res.status(200).json(result);
  }
}

const resolveQuery = (query: any) => {
  let url = "/";
  query.map((q: any) => (url += q + "/"));
  return url;
};

export const scuteLogout = (req: NextApiRequest, res: NextApiResponse) => {
  deleteCookies(req, res);
  // expires: expiration,
  // domain: this.appDomain,
  // secure: secure
  // const access_time = req.cookies["sc-access_time"];
  // const refresh_time = req.cookies["sc-refresh_time"];
  // let access_expires, refresh_expires

  // try {
  //   access_expires = new Date(access_time)
  // } catch(error) {
  //   access_expires = new Date()
  // }
  // try {
  //   refresh_expires = new Date(refresh_time)
  // } catch (error) {
  //   refresh_expires = new Date()
  // }
  // res.setHeader(
  //   "Set-Cookie", [
  //   `sc-access-token=deleted; Max-Age=0; path=/`,
  //   ]
  //   );
  return res.status(200).json({ message: "ok" });
};

export const deleteCookies = (req: NextApiRequest, res: NextApiResponse) => {
  // deleteCookie(ctx, name, { req, res, path: '/path', domain: '.yourdomain.com' });
  const access_time = req.cookies["sc-access_time"];
  const refresh_time = req.cookies["sc-refresh_time"];
  let access_expires, refresh_expires;

  if (access_time) {
    try {
      access_expires = new Date(access_time);
    } catch {}
  }

  if (!access_expires) {
    access_expires = new Date();
  }

  if (refresh_time) {
    try {
      refresh_expires = new Date(refresh_time);
    } catch {}
  }

  if (!refresh_expires) {
    refresh_expires = new Date();
  }

  deleteCookie("sc-access-token", {
    req,
    res,
    expires: access_expires,
    domain: app_domain,
    secure: false,
  });
  deleteCookie("sc-refresh-token", {
    req,
    res,
    expires: refresh_expires,
    domain: app_domain,
    secure: true,
  });
  deleteCookie("X-CSRF-Token", { req, res, domain: app_domain, secure: false });
};

export const scuteNode = (access?: string, refresh?: string, csrf?: string) => {
  const instance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_SCUTE_BASE_URL,
    headers: {
      "Content-type": "application/json",
      "X-Authorization": access,
      "X-Refresh-Token": refresh,
      "X-CSRF-Token": csrf,
    },
  });
  instance.interceptors.response.use(
    function (response) {
      return response.data;
    },
    function (error) {
      return Promise.reject(error);
    }
  );
  return instance;
};

export const refresh = async (refresh: string, csrf: string) => {
  return scuteNode(undefined, refresh, csrf).post(`/v1/auth/${app_id}/auth/refresh`);
};
