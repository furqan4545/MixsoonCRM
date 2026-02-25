"use client";

import { useEffect } from "react";

const EMAIL_REFRESH = "email:refresh";

export function emitEmailRefresh() {
  window.dispatchEvent(new CustomEvent(EMAIL_REFRESH));
}

export function useEmailRefresh(callback: () => void) {
  useEffect(() => {
    window.addEventListener(EMAIL_REFRESH, callback);
    return () => window.removeEventListener(EMAIL_REFRESH, callback);
  }, [callback]);
}
