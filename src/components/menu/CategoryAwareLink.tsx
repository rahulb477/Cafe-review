"use client";

import Link from "next/link";
import { Suspense, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useClient, useClientHref } from "@/components/ClientProvider";
import { getCategories } from "@/services/menuService";

interface Props {
  /** Client-relative path, e.g. "/menu" or "/menu/cappuccino". */
  path: string;
  /** Query key used to carry the category: "category" for the list, "from" for details. */
  param: "category" | "from";
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

function build(base: string, param: string, category: string | null) {
  return category ? `${base}?${param}=${encodeURIComponent(category)}` : base;
}

function Inner({ path, param, className, children, ...rest }: Props) {
  const client = useClient();
  const href = useClientHref();
  const params = useSearchParams();
  const categories = useMemo(() => getCategories(client), [client]);
  const raw = params.get("from") ?? params.get("category");
  const category = raw && raw !== "All" && categories.includes(raw) ? raw : null;
  return (
    <Link href={build(href(path), param, category)} className={className} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Link that preserves the menu category the customer came from
 * (/menu?category=Coffee → /menu/cappuccino?from=Coffee → back to Coffee).
 */
export function CategoryAwareLink(props: Props) {
  const href = useClientHref();
  return (
    <Suspense
      fallback={
        <Link href={href(props.path)} className={props.className} aria-label={props["aria-label"]}>
          {props.children}
        </Link>
      }
    >
      <Inner {...props} />
    </Suspense>
  );
}
