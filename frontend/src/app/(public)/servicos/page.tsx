import { redirect } from "next/navigation"

export default async function PublicServicosAliasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = (await searchParams) ?? {}
  const companySlug =
    typeof resolvedSearchParams.company_slug === "string" ? resolvedSearchParams.company_slug.trim() : ""
  redirect(companySlug ? `/p/servicos?company_slug=${encodeURIComponent(companySlug)}` : "/p/servicos")
}
