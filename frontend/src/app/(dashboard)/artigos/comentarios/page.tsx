"use client"

import { Suspense } from "react"
import { ModuleGuard } from "@/components/module-guard"
import { Protected } from "@/components/auth/protected"
import { CommentModeration } from "@/features/articles/comment-moderation"

export default function ArticleCommentsModerationPage() {
  return (
    <ModuleGuard moduleCode="articles">
      <Suspense fallback={null}>
        <Protected requiredPermissions={["articles.comment_moderate"]}>
          <CommentModeration />
        </Protected>
      </Suspense>
    </ModuleGuard>
  )
}
