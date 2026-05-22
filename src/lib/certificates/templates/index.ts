import type { ReactElement } from "react"
import type { DocumentProps } from "@react-pdf/renderer"
import type { CertificateLayout } from "@prisma/client"
import { ClassicCertificate, type CertificateRenderData } from "./classic"
import { ModernCertificate } from "./modern"
import { MinimalCertificate } from "./minimal"

export type { CertificateRenderData } from "./classic"

export function renderCertificateByLayout(
  layout: CertificateLayout,
  data: CertificateRenderData,
): ReactElement<DocumentProps> {
  switch (layout) {
    case "MODERN":
      return ModernCertificate(data) as ReactElement<DocumentProps>
    case "MINIMAL":
      return MinimalCertificate(data) as ReactElement<DocumentProps>
    case "CLASSIC":
    default:
      return ClassicCertificate(data) as ReactElement<DocumentProps>
  }
}
