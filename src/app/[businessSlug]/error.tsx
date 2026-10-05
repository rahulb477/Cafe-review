"use client";

import { useEffect } from "react";
import { StatusScreen } from "@/components/StatusScreen";

export default function ClientError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusScreen
      emoji="😕"
      title="Something went wrong"
      message="Don't worry — your data is safe. Please try again."
      action={{ label: "Try again", onClick: reset }}
    />
  );
}
