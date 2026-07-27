import { auth } from "@/lib/auth"
import { dbReady } from "@/lib/db"
import { toNextJsHandler } from "better-auth/next-js"

const handler = toNextJsHandler(auth.handler)

export async function GET(req: Request) {
  await dbReady
  try {
    return await handler.GET(req)
  } catch (e) {
    console.error("[v0] Auth GET error:", e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  await dbReady
  try {
    return await handler.POST(req)
  } catch (e) {
    console.error("[v0] Auth POST error:", e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
