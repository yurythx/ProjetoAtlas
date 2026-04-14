import fs from "node:fs"
import path from "node:path"

const root = path.resolve(process.cwd())

const targets = [".next", ".next-dev", "node_modules/.cache"]

for (const target of targets) {
  const fullPath = path.join(root, target)
  try {
    fs.rmSync(fullPath, { recursive: true, force: true })
  } catch {}
}

