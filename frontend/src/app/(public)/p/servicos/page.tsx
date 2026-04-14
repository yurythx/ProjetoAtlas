import { redirect } from "next/navigation"

export default async function PublicServicosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = (await searchParams) ?? {}
  const companySlug =
    typeof resolvedSearchParams.company_slug === "string" ? resolvedSearchParams.company_slug.trim() : ""
  const target = companySlug
    ? `/p/ecossistema-de-servicos?company_slug=${encodeURIComponent(companySlug)}`
    : "/p/ecossistema-de-servicos"
  redirect(target)
}
