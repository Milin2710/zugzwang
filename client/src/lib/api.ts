"use client";

import axios from "axios";
import { useAuth } from "@clerk/nextjs";
import { useMemo, useRef } from "react";

/** Axios instance that attaches the current Clerk session token to every request. */
export function useApi() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  return useMemo(() => {
    const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_BACKEND_URL });
    api.interceptors.request.use(async (config) => {
      const token = await getTokenRef.current();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return api;
  }, []);
}
