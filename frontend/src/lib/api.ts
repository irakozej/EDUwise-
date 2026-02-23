import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("eduwise_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`; // standard
  }
  return config;
});