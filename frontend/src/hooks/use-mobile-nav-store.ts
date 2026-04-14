"use client"

import { create } from "zustand"

interface MobileNavStore {
  isMobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
}

export const useMobileNavStore = create<MobileNavStore>((set) => ({
  isMobileNavOpen: false,
  setMobileNavOpen: (open) => set({ isMobileNavOpen: open }),
}))

