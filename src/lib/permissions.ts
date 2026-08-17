import type { UserProfile } from '../AuthContext'

// DEV = único "super admin" real do sistema
export function isGlobalAdmin(profile: UserProfile | null): boolean {
  if (!profile) return false
  return profile.nivel === 'DEV'
}

// SUP tem visibilidade total mas sem poder de admin de usuários
export function isSupervisorOrAbove(profile: UserProfile | null): boolean {
  if (!profile) return false
  return profile.nivel === 'DEV' || profile.nivel === 'SUP'
}

// Apenas DEV gerencia usuários
export function canManageUsers(profile: UserProfile | null, isSuperAdmin: boolean = false): boolean {
  if (isSuperAdmin) return true
  return isGlobalAdmin(profile)
}

// DEV e SUP veem logs de auditoria
export function canViewAuditLogs(profile: UserProfile | null, isSuperAdmin: boolean = false): boolean {
  if (isSuperAdmin) return true
  return isSupervisorOrAbove(profile)
}

// Qualquer nível autenticado pode criar (OP cria na própria carga)
export function canCreateRecords(profile: UserProfile | null, isSuperAdmin: boolean = false): boolean {
  if (isSuperAdmin) return true
  if (!profile) return false
  return true // Todos os níveis podem criar — OP auto-atribui a si mesmo
}

// Distribuição: ADM/DEV/SUP em setores logísticos (não VENDAS)
export function canDistributeLoads(profile: UserProfile | null, isSuperAdmin: boolean = false): boolean {
  if (isSuperAdmin) return true
  if (!profile) return false
  if (isSupervisorOrAbove(profile)) return true

  const isADM = profile.nivel === 'ADM'
  const allowedSectors = ['EMPENHOS', 'DIRECAO', 'LOGISTICA']
  return isADM && allowedSectors.includes(profile.setor)
}

// Editar empenho: DEV edita qualquer; outros só a própria carga
export function canEditNota(profile: UserProfile | null, isSuperAdmin: boolean, nota: any): boolean {
  if (isSuperAdmin) return true
  if (!profile) return false
  if (isGlobalAdmin(profile)) return true // DEV edita tudo

  const isOwner = nota.owner_id === profile.id
  const isAssignedToMe = nota.assigned_to === profile.id
  return isOwner || isAssignedToMe
}

// Deletar empenho: DEV ou dono (owner_id)
export function canDeleteNota(profile: UserProfile | null, isSuperAdmin: boolean, nota: any): boolean {
  if (isSuperAdmin) return true
  if (!profile) return false
  if (isGlobalAdmin(profile)) return true // DEV deleta tudo

  return nota.owner_id === profile.id
}

// Deletar ATA: DEV, dono (owner_id) ou responsável (assigned_to)
export function canDeleteAta(profile: UserProfile | null, isSuperAdmin: boolean, ata: any): boolean {
  if (isSuperAdmin) return true
  if (!profile) return false
  if (isGlobalAdmin(profile)) return true
  if (profile.nivel === 'ADM' && profile.setor === 'LICIT') return true

  return ata.owner_id === profile.id || ata.assigned_to === profile.id
}

// Deletar baixa: DEV, ADM do setor de EMPENHOS, ou próprio vendedor
export function canDeleteBaixa(profile: UserProfile | null, isSuperAdmin: boolean, baixa: any): boolean {
  if (isSuperAdmin) return true
  if (!profile) return false
  
  // DEV e ADMs do setor de EMPENHOS podem deletar qualquer baixa
  if (profile.nivel === 'DEV') return true
  if (profile.nivel === 'ADM' && profile.setor === 'EMPENHOS') return true

  // Se a baixa já tem o vendedor_id (novos registros)
  if (baixa && baixa.vendedor_id) {
    return baixa.vendedor_id === profile.id
  }

  // Fallback para registros legados (vendedor_id null): 
  // permite se o usuário é o responsável atribuído ao empenho
  if (baixa && baixa.empenho_assigned_to) {
    return baixa.empenho_assigned_to === profile.id
  }

  return false
}

// Distribuir uma nota específica: quem pode distribuir cargas e é dono ou DEV
export function canDistributeNota(profile: UserProfile | null, isSuperAdmin: boolean, nota: any): boolean {
    if (!canDistributeLoads(profile, isSuperAdmin)) return false
    if (isSuperAdmin) return true
    if (!profile) return false
    if (isGlobalAdmin(profile)) return true

    const isOwner = nota.owner_id === profile.id
    const isDirecao = profile.setor === 'DIRECAO'

    if (isDirecao) return isOwner
    return true
}

// Editar contrato: DEV, ADM do setor LICIT, ou próprio dono/responsável
export function canEditContrato(profile: UserProfile | null, isSuperAdmin: boolean, contrato: any): boolean {
  if (isSuperAdmin) return true
  if (!profile) return false
  if (isGlobalAdmin(profile)) return true
  if (profile.nivel === 'ADM' && profile.setor === 'LICIT') return true

  const isOwner = contrato.owner_id === profile.id
  const isAssignedToMe = contrato.assigned_to === profile.id
  return isOwner || isAssignedToMe
}

// Deletar contrato: DEV, ADM do setor LICIT, ou próprio dono (owner)
export function canDeleteContrato(profile: UserProfile | null, isSuperAdmin: boolean, contrato: any): boolean {
  if (isSuperAdmin) return true
  if (!profile) return false
  if (isGlobalAdmin(profile)) return true
  if (profile.nivel === 'ADM' && profile.setor === 'LICIT') return true

  return contrato.owner_id === profile.id
}

// Toggle Modo SESAU: DEV ou ADM
export function canToggleModoSesau(profile: UserProfile | null): boolean {
  if (!profile) return false
  return profile.nivel === 'DEV' || profile.nivel === 'ADM'
}

// Relatório SESAU: DEV, ADM EMPENHOS ou ADM DIREÇÃO
export function canViewSesauReport(profile: UserProfile | null): boolean {
  if (!profile) return false
  if (profile.nivel === 'DEV') return true
  if (profile.nivel === 'ADM') {
    return profile.setor === 'EMPENHOS' || profile.setor === 'DIRECAO'
  }
  return false
}

// Deletar solicitação de compra pendente: DEV ou ADM do setor de VENDAS ou VENDAS_PRIVADO
export function canDeletePedidoCompra(profile: UserProfile | null): boolean {
  if (!profile) return false
  if (profile.nivel === 'DEV') return true
  if (profile.nivel === 'ADM' && (profile.setor === 'VENDAS' || profile.setor === 'VENDAS_PRIVADO')) return true
  return false
}

