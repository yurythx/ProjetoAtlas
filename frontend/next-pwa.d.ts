declare module "next-pwa" {
  import type { NextConfig } from "next"

  type WithPwa = (config?: NextConfig) => NextConfig

  export default function withPWA(options?: unknown): WithPwa
}

