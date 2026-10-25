"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { useUserData } from "../contexts/UserDataContext";
import { useApi } from "@/lib/api";

/** After sign-in, ask the server to create/refresh our user record (data comes from Clerk server-side). */
export default function SyncUser() {
  const api = useApi();
  const { user } = useUser();
  const { setUserData } = useUserData();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setUserData(null);
      return;
    }
    let cancelled = false;
    api
      .post("/api/users/sync")
      .then((res) => !cancelled && setUserData(res.data))
      .catch((err) => console.error("Error syncing user:", err?.response?.data ?? err.message));
    return () => {
      cancelled = true;
    };
  }, [api, userId, setUserData]);

  return null;
}
