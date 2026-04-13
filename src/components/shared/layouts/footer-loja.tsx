interface FooterLojaProps {
  tenantName?: string
}

export function FooterLoja({ tenantName }: FooterLojaProps) {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
          <p className="text-sm text-gray-600">
            &copy; {new Date().getFullYear()} {tenantName ?? "Cursos Online"}. Todos os direitos reservados.
          </p>
          <p className="text-xs text-gray-400">
            Powered by Profissionaliza Mais Brasil
          </p>
        </div>
      </div>
    </footer>
  )
}
