import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true, // sends the JWT httpOnly cookie
});

export default api;
