import { useAuth } from "@/hooks/use-auth"

function normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === "string")
    }
    if (typeof value === "string") {
        const trimmed = value.trim()
        if (!trimmed) return []
        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed)
                if (Array.isArray(parsed)) {
                    return parsed.filter((v): v is string => typeof v === "string")
                }
            } catch { }
        }
        return trimmed
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    }
    return []
}

export function usePermission() {
    const { user } = useAuth()

    const hasPermission = (permissionSlug: string): boolean => {
        if (!user) return false

        // Superuser has all permissions
        if (user.is_superuser) return true

        // Check if user has role and permissions
        if (!user.role_details || !user.role_details.permissions) {
            return false
        }

        const perms = normalizeStringArray(user.role_details.permissions)
        if (perms.includes("*")) return true
        return perms.includes(permissionSlug)
    }

    const hasRole = (roleName: string): boolean => {
        if (!user) return false
        if (user.is_superuser) return true // Superuser passes role checks too? usually yes or handled separately

        return user.role_details?.name === roleName
    }

    return {
        hasPermission,
        hasRole,
        userRole: user?.role_details
    }
}
