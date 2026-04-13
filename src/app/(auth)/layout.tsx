import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Login | Profissionaliza Mais Brasil",
  description: "Acesse sua conta no Profissionaliza Mais Brasil",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Brand Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-blue-600 px-12 text-white">
        <h1 className="text-4xl font-bold leading-tight">
          Profissionaliza Mais Brasil
        </h1>
        <p className="mt-4 text-lg text-blue-100">
          Venda cursos profissionalizantes com sua marca.
        </p>
      </div>

      {/* Form Panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
