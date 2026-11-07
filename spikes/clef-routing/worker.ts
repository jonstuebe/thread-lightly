// PROTOTYPE, throwaway. A pass-through to Workers AI so the spike runner can
// call Clef without handling Cloudflare credentials itself: `wrangler dev`
// owns the auth, and the AI binding always runs remotely.

type Env = { AI: { run: (model: string, input: unknown) => Promise<unknown> } }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { model, input } = (await request.json()) as {
      model: string
      input: unknown
    }
    const startedAt = Date.now()
    try {
      const output = await env.AI.run(model, input)
      return Response.json({ ms: Date.now() - startedAt, output })
    } catch (error) {
      return Response.json(
        { ms: Date.now() - startedAt, error: String(error) },
        { status: 500 },
      )
    }
  },
}
