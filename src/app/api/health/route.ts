import { firebaseConfig } from "@/services/firebase/firebaseConfig";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness probe for the Firebase-only Customer App.
 *
 * No database is contacted: the app's backend is Firebase/Firestore, which the
 * page components and routes reach over the SDK / REST API. This endpoint only
 * reports what the running instance is configured to use, so it works with no
 * environment variables beyond the public NEXT_PUBLIC_FIREBASE_* config.
 */
export async function GET() {
  return Response.json({
    ok: true,
    app: "customer",
    backend: "firebase",
    firebaseProjectId: firebaseConfig.projectId,
    timestamp: new Date().toISOString(),
  });
}
