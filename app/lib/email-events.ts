"use client";

import { useEffect, useRef } from "react";

const EMAIL_REFRESH = "email:refresh";

export function emitEmailRefresh() {
  window.dispatchEvent(new CustomEvent(EMAIL_REFRESH));
}

export function useEmailRefresh(callback: () => void | Promise<void>) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const handler = () => {
      void callbackRef.current();
    };

    window.addEventListener(EMAIL_REFRESH, handler);
    return () => window.removeEventListener(EMAIL_REFRESH, handler);
  }, []);
}
