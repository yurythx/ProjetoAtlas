import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIStore {
  isSidebarCollapsed: boolean
  toggleSidebar: () => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    {
      name: 'ui-storage',
    }
  )
)
