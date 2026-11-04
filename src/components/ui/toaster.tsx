"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        style: { borderRadius: "12px", fontFamily: "var(--font-sans)" },
      }}
    />
  );
}
