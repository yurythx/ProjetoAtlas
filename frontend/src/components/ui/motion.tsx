"use client"

import { motion, HTMLMotionProps } from "framer-motion"
import { cn } from "@/lib/utils"

interface SlideUpProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode
    className?: string
    delay?: number
}

export function SlideUp({ children, className, delay = 0, ...props }: SlideUpProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.5,
                delay: delay,
                ease: [0.21, 0.47, 0.32, 0.98] // Custom cubic-bezier for premium feel
            }}
            className={cn(className)}
            {...props}
        >
            {children}
        </motion.div>
    )
}

export function FadeIn({ children, className, delay = 0, ...props }: SlideUpProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
                duration: 0.6,
                delay: delay,
                ease: "easeOut"
            }}
            className={cn(className)}
            {...props}
        >
            {children}
        </motion.div>
    )
}
