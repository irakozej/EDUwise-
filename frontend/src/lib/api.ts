import axios from "axios";
import { getRefreshToken, setAccessToken, setRefreshToken, clearAccessToken } from "./auth";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({ baseURL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("eduwise_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let _refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearAccessToken();
        window.location.href = "/";
        return Promise.reject(error);
      }
      try {
        if (!_refreshing) {
          _refreshing = axios
            .post(`${baseURL}/api/v1/auth/refresh`, { refresh_token: refreshToken })
            .then((r) => {
              setAccessToken(r.data.access_token);
              if (r.data.refresh_token) setRefreshToken(r.data.refresh_token);
              return r.data.access_token;
            })
            .finally(() => { _refreshing = null; });
        }
        const newToken = await _refreshing;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        clearAccessToken();
        window.location.href = "/";
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
