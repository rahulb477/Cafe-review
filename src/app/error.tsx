"use client";

import { StatusScreen } from "@/components/StatusScreen";

export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
      <StatusScreen emoji="😕" title="Something went wrong" message="Please try again in a moment." action={{ label: "Try again", onClick: reset }} />
    </div>
  );
}
