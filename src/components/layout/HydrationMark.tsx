"use client";

import { useEffect } from "react";

/** Sets <html data-hydrated> once React is interactive (tests wait on it before typing/clicking). */
export function HydrationMark() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);
  return null;
}
