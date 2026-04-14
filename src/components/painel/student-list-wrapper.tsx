"use client"

import { useState } from "react"
import { StudentTable } from "./student-table"
import { StudentDetailDrawer } from "./student-detail-drawer"

export function StudentListWrapper() {
  const [viewingId, setViewingId] = useState<string | null>(null)

  return (
    <>
      <StudentTable onViewDetails={(id) => setViewingId(id)} />
      <StudentDetailDrawer
        open={viewingId !== null}
        onClose={() => setViewingId(null)}
      />
    </>
  )
}
