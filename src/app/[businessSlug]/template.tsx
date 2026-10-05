import type { ReactNode } from "react";

/** Re-mounts on every navigation, giving each screen a subtle enter transition. */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col">{children}</div>;
}
