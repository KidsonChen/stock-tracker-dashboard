import { getLoginUrl } from "@/const";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};

  // 本專案為免登入設計（stock-tracker-dashboard），後端無 auth router。
  // 因此一律視為已登入，不發任何 auth 請求，避免 tRPC 型別/運行錯誤。
  const logout = useCallback(async () => {
    try {
      sessionStorage.removeItem("manus-cookie");
    } catch {}
  }, []);

  const state = useMemo(() => {
    return {
      user: { name: "User", email: "" },
      loading: false,
      error: null,
      isAuthenticated: true,
    };
  }, []);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => {},
    logout,
  };
}
