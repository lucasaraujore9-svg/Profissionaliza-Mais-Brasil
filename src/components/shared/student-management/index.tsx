"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Bell,
  CreditCard,
  KeyRound,
  MessageSquare,
  User as UserIcon,
  UserCog,
} from "lucide-react"
import { OverviewTab } from "./overview-tab"
import { EditTab } from "./edit-tab"
import { FinancialTab } from "./financial-tab"
import { NotesTab } from "./notes-tab"
import { NotifyTab } from "./notify-tab"
import { SecurityTab } from "./security-tab"
import type { ManagementScope, StudentData } from "./types"

interface Props {
  student: StudentData
  scope: ManagementScope
  currentUserId: string
}

export function StudentManagement({ student, scope, currentUserId }: Props) {
  return (
    <Tabs defaultValue="overview" className="gap-4">
      <TabsList variant="line" className="h-auto flex-wrap">
        <TabsTrigger value="overview">
          <UserIcon className="h-3.5 w-3.5" />
          Visão geral
        </TabsTrigger>
        <TabsTrigger value="financial">
          <CreditCard className="h-3.5 w-3.5" />
          Matrículas & financeiro
        </TabsTrigger>
        <TabsTrigger value="notes">
          <MessageSquare className="h-3.5 w-3.5" />
          Notas internas
        </TabsTrigger>
        <TabsTrigger value="notify">
          <Bell className="h-3.5 w-3.5" />
          Notificações
        </TabsTrigger>
        <TabsTrigger value="edit">
          <UserCog className="h-3.5 w-3.5" />
          Editar
        </TabsTrigger>
        <TabsTrigger value="security">
          <KeyRound className="h-3.5 w-3.5" />
          Senha & acesso
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OverviewTab student={student} />
      </TabsContent>
      <TabsContent value="financial">
        <FinancialTab student={student} scope={scope} />
      </TabsContent>
      <TabsContent value="notes">
        <NotesTab
          studentId={student.id}
          initialNotes={student.notes}
          scope={scope}
          currentUserId={currentUserId}
        />
      </TabsContent>
      <TabsContent value="notify">
        <NotifyTab
          studentId={student.id}
          initialNotifications={student.notifications}
          scope={scope}
        />
      </TabsContent>
      <TabsContent value="edit">
        <EditTab student={student} scope={scope} />
      </TabsContent>
      <TabsContent value="security">
        <SecurityTab student={student} scope={scope} />
      </TabsContent>
    </Tabs>
  )
}
