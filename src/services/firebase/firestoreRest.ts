import "server-only";
import { firebaseConfig, CLIENT_REVALIDATE_SECONDS } from "./firebaseConfig";

/**
 * Minimal server-side Firestore reader over the REST API. Uses Next.js fetch
 * caching (ISR) and only reads publicly readable, rule-protected data
 * (published clients + active menus). No credentials are used or required.
 */
type FsValue = Record<string, unknown>;
export interface FsDoc {
  id: string;
  path: string;
  data: Record<string, unknown>;
}

const BASE = () => `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

function decode(v: FsValue): unknown {
  const [k, x] = Object.entries(v)[0] ?? [];
  switch (k) {
    case "mapValue":
      return decodeFields(((x as { fields?: Record<string, FsValue> }) ?? {}).fields ?? {});
    case "arrayValue":
      return (((x as { values?: FsValue[] }) ?? {}).values ?? []).map(decode);
    case "integerValue":
      return Number(x);
    case "doubleValue":
      return Number(x);
    case "nullValue":
      return null;
    default:
      return x; // string, boolean, timestamp (ISO string), reference, geo, bytes
  }
}

function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

function toDoc(raw: { name: string; fields?: Record<string, FsValue> }): FsDoc {
  const path = raw.name.split("/documents/")[1] ?? raw.name;
  return { id: path.split("/").pop() ?? "", path, data: decodeFields(raw.fields ?? {}) };
}

export class FirestoreUnavailableError extends Error {}

async function call(url: string, init: RequestInit & { tags?: string[] } = {}) {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      next: { revalidate: CLIENT_REVALIDATE_SECONDS, tags: init.tags },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new FirestoreUnavailableError(e instanceof Error ? e.message : "network error");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new FirestoreUnavailableError(`Firestore ${res.status}`);
  return res.json();
}

/**
 * AND-of-equalities query (path relative to /documents). Equality-only queries are
 * served by Firestore's built-in single-field indexes (no composite index needed).
 */
export async function queryWhere(collectionPath: string, equals: [string, string][], limit?: number, tags?: string[]): Promise<FsDoc[]> {
  const parent = collectionPath.split("/").slice(0, -1).join("/");
  const collectionId = collectionPath.split("/").pop();
  const url = `${BASE()}${parent ? `/${parent}` : ""}:runQuery`;
  const filters = equals.map(([field, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } }));
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } },
      ...(limit ? { limit } : {}),
    },
  };
  const rows = ((await call(url, { method: "POST", body: JSON.stringify(body), tags })) ?? []) as { document?: { name: string; fields?: Record<string, FsValue> } }[];
  return rows.filter((r) => r.document).map((r) => toDoc(r.document!));
}

/** Equality query on a collection (path relative to /documents). */
export async function queryEquals(collectionPath: string, field: string, value: string, limit = 1, tags?: string[]): Promise<FsDoc[]> {
  const parent = collectionPath.split("/").slice(0, -1).join("/");
  const collectionId = collectionPath.split("/").pop();
  const url = `${BASE()}${parent ? `/${parent}` : ""}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } },
      limit,
    },
  };
  const rows = ((await call(url, { method: "POST", body: JSON.stringify(body), tags })) ?? []) as { document?: { name: string; fields?: Record<string, FsValue> } }[];
  return rows.filter((r) => r.document).map((r) => toDoc(r.document!));
}

export async function getDocument(path: string, tags?: string[]): Promise<FsDoc | null> {
  const raw = await call(`${BASE()}/${path}`, { tags });
  return raw ? toDoc(raw) : null;
}

export async function listDocuments(collectionPath: string, tags?: string[]): Promise<FsDoc[]> {
  const out: FsDoc[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const raw = (await call(`${BASE()}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`, { tags })) as {
      documents?: { name: string; fields?: Record<string, FsValue> }[];
      nextPageToken?: string;
    } | null;
    out.push(...(raw?.documents ?? []).map(toDoc));
    if (!raw?.nextPageToken) break;
    pageToken = encodeURIComponent(raw.nextPageToken);
  }
  return out;
}
