import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Login } from './Login'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardLayout } from './components/Layout/DashboardLayout'
import { EmpenhoList } from './components/Empenhos/EmpenhoList'
import { Atas } from './Atas'
import { CriarAta } from './pages/CriarAta'
import { CriarEmpenho } from './pages/CriarEmpenho'
import { PaginaBaixaNF } from './pages/PaginaBaixaNF'
import { Relatorios } from './Relatorios'
import { PaginaBaixaDAV } from './pages/PaginaBaixaDAV'
import { Financeiro } from './pages/Financeiro'
import { AuditLogs } from './AuditLogs'
import { AdminPanel } from './AdminPanel'
import { Dashboard } from './pages/Dashboard'
import { DistribuicaoCargas } from './pages/DistribuicaoCargas'
import { MinhasTarefas } from './pages/MinhasTarefas'
import { ModuloCompras } from './pages/ModuloCompras'
import { CotacaoPrivado } from './pages/CotacaoPrivado'
import { Profile } from './pages/Profile'
import { ResetPassword } from './pages/ResetPassword'
import { GeradorOficio } from './pages/GeradorOficio'
import VendedorDashboard from './pages/VendedorDashboard'
import { ImportarCatalogo } from './pages/ImportarCatalogo'
import { NexusMonitor } from './pages/NexusMonitor'
import { ChamadosNexus } from './pages/ChamadosNexus'
import { ThemeProvider } from './contexts/ThemeContext'

function App() {
  return (
    <ThemeProvider>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* Default redirect to dashboard */}
          <Route index element={<Navigate to="/dashboard" replace />} />
          
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="cargas" element={<DistribuicaoCargas />} />
          <Route path="tarefas" element={<MinhasTarefas />} />
          <Route path="compras" element={<ModuloCompras />} />
          <Route path="cotacao-privado" element={<CotacaoPrivado />} />
          
          <Route path="cadastrar-ata" element={<CriarAta />} />
          <Route path="cadastrar-empenho" element={<CriarEmpenho />} />
          <Route path="baixa-nf" element={<PaginaBaixaNF />} />
          <Route path="baixa-dav" element={<PaginaBaixaDAV />} />
          <Route path="empenhos" element={<EmpenhoList />} />
          <Route path="atas" element={<Atas />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="admin" element={<AdminPanel />} />
          <Route path="perfil" element={<Profile />} />
          <Route path="oficios" element={<GeradorOficio />} />
          <Route path="vendas" element={<VendedorDashboard />} />
          <Route path="licitacoes" element={<Navigate to="/atas" replace />} />
          <Route path="importar-catalogo" element={<ImportarCatalogo />} />
          <Route path="monitor" element={<NexusMonitor />} />
          <Route path="chamados" element={<ChamadosNexus />} />

        </Route>
      </Routes>
    </ThemeProvider>
  )
}

export default App
