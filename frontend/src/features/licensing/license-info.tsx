"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { License, Plan } from "@/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

export function LicenseInfo() {
  const { data: licenses, isLoading } = useQuery({
    queryKey: ['licenses'],
    queryFn: async () => {
      const res = await api.get<License[]>('/api/licensing/my-license/')
      return res.data
    }
  })

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await api.get<Plan[]>('/api/licensing/plans/')
      return res.data
    }
  })

  if (isLoading) return (
    <div role="status" aria-live="polite" aria-label="Carregando informações de licença">
      Loading license info...
    </div>
  )

  const currentLicense = licenses?.[0]
  const currentPlan = plans?.find(p => p.id === currentLicense?.plan)

  if (!currentLicense) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Active License</CardTitle>
          <CardDescription>Please contact support to activate a plan.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Current Plan: {currentPlan?.name || "Unknown"}</CardTitle>
            <CardDescription>License Details</CardDescription>
          </div>
          <Badge variant={currentLicense.is_active ? "default" : "destructive"}>
            {currentLicense.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Start Date</p>
            <p className="font-medium">{format(new Date(currentLicense.start_date), 'PP')}</p>
          </div>
          <div>
            <p className="text-muted-foreground">End Date</p>
            <p className="font-medium">
              {currentLicense.end_date 
                ? format(new Date(currentLicense.end_date), 'PP') 
                : "Lifetime"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Price</p>
            <p className="font-medium">${currentPlan?.price}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
