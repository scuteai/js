import axios from "axios";

const baseUrl = process.env.NEXT_PUBLIC_SCUTE_BASE_URL;
// const scuteSecret = process.env.SCUTE_SECRET

export const apiClient = (() => {
  const instance = axios.create({
    baseURL: "/api/scute",
    headers: {
      "Content-type": "application/json",
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
})();
