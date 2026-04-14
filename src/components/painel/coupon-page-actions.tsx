"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CreateCouponModal } from "./create-coupon-modal"

export function CouponPageActions() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        className="bg-blue-600 text-white hover:bg-blue-700"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-2 h-4 w-4" />
        Novo cupom
      </Button>
      <CreateCouponModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
