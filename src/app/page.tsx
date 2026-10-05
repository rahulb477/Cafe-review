import { redirect } from "next/navigation";
import { DEFAULT_CLIENT_SLUG } from "@/config/platform";

// The bare domain forwards to the default client (configurable via NEXT_PUBLIC_DEFAULT_CLIENT).
export default function RootPage() {
  redirect(`/${DEFAULT_CLIENT_SLUG}`);
}
