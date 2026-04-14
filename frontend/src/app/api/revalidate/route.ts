import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const secretHeader = req.headers.get('x-revalidate-secret') || ''
    const secretEnv = process.env.NEXT_REVALIDATE_SECRET || ''
    if (secretEnv && secretHeader !== secretEnv) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const slug = body.slug as string | undefined
    const path = body.path as string | undefined

    const paths: string[] = []
    if (path) paths.push(path)
    if (slug) paths.push(`/p/artigos/${slug}`)
    paths.push('/p/artigos')

    for (const p of paths) {
      revalidatePath(p)
    }

    return new Response(JSON.stringify({ ok: true, revalidated: paths }), { status: 200 })
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'bad_request' }), { status: 400 })
  }
}
