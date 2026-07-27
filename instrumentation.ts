/**
 * Next.js Instrumentation — runs once on server startup before any request is served.
 * We await the database migration here so every table exists before Better Auth
 * or any server action tries to query the database.
 */
export async function register() {
  // Only run in the Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { dbReady } = await import("@/lib/db")
    await dbReady
  }
}
