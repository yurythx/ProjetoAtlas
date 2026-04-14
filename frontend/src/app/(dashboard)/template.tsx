"use client"

import { motion } from "framer-motion"

export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ease: [0.21, 0.47, 0.32, 0.98], duration: 0.8 }}
        >
            {children}
        </motion.div>
    )
}
