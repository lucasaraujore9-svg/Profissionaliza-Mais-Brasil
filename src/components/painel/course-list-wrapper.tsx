"use client"

import { useState } from "react"
import { CourseListTable } from "./course-list-table"
import { CourseEditDrawer } from "./course-edit-drawer"

export function CourseListWrapper() {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <>
      <CourseListTable onEdit={(id) => setEditingId(id)} />
      <CourseEditDrawer
        open={editingId !== null}
        onClose={() => setEditingId(null)}
      />
    </>
  )
}
