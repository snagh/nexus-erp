import { supabase } from './supabase'
import type { Database } from '../supabaseTypes'

// --- LOGGING / AUDITORIA ---
/**
 * Registra uma operação no sistema de Logs (tabela audit_logs).
 */
export async function logOperation(
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'LOGIN' | 'VISUALIZACAO',
  table: string,
  recordId: string,
  details: Database['public']['Tables']['audit_logs']['Insert']['details'],
  user?: { id: string, email?: string }
) {
    if (!user) return
    try {
        await supabase.from('audit_logs').insert({
            action,
            table_name: table,
            record_id: recordId,
            details,
            user_id: user.id,
            user_email: user.email
        })
    } catch (err) {
        console.error('Falha ao registrar log de auditoria:', err)
    }
}

// --- NOTAS (EMPENHOS) ---

export async function insertNotas(
  rows: Database['public']['Tables']['notas']['Insert'][],
  user?: { id: string, email?: string }
) {
  const result = await supabase.from('notas').insert(rows).select()
  
  if (result.data && user) {
      for (const row of result.data) {
          await logOperation('CREATE', 'notas', String(row.id), row, user)
      }
  }
  return result
}

/**
 * Insere uma nota e retorna o registro criado (usado nos formulários de criação rápida).
 */
export async function insertAndSelectNota(
  rows: Database['public']['Tables']['notas']['Insert'][],
  user?: { id: string, email?: string }
) {
  const result = await supabase.from('notas').insert(rows).select().single()
  
  if (result.data && user) {
    await logOperation('CREATE', 'notas', String(result.data.id), result.data, user)
  }
  return result
}

export async function updateNota<
  K extends keyof Database['public']['Tables']['notas']['Row']
>(
  payload: Database['public']['Tables']['notas']['Update'],
  key: K,
  value: Database['public']['Tables']['notas']['Row'][K],
  user?: { id: string, email?: string }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await supabase.from('notas').update(payload).eq(key as any, value as any).select()
  
  if (result.data && result.data.length > 0 && user) {
       await logOperation('UPDATE', 'notas', String(result.data[0].id), payload, user)
  }
  return result
}

export interface NotaFilters {
    emissor?: string
    status?: string
    statusArray?: string[]
    dataInicio?: string
    dataFim?: string
    ownerId?: string
    setor?: string
    excludeAssignedTo?: string
    estado?: string
    municipio?: string
    nomeEntidade?: string
    itemSearch?: string
    assignedTo?: string
}

/**
 * Busca notas com filtros avançados e suporte a paginação.
 */
export async function selectAllNotas(
  columns = '*, entidades (*, itens (*, historico_entregas (*)))',
  page = 0,
  pageSize = 10,
  filters?: NotaFilters,
  userId?: string,
  restrictToUser?: boolean,
  orderBy = { column: 'created_at', ascending: false }
) {
  const from = page * pageSize
  const to = from + pageSize - 1

  let selectedColumns = columns
  if (filters && (filters.estado || filters.municipio || filters.nomeEntidade)) {
    selectedColumns = columns.replace(/entidades\s*\(/g, 'entidades!inner(')
  }

  let query = supabase
    .from('notas')
    .select(selectedColumns, { count: 'exact' })
  
  // Regra de Visão Restrita (OP)
  if (restrictToUser && userId) {
      query = query.or(`owner_id.eq.${userId},assigned_to.eq.${userId}`)
  }
  
  if (filters) {
      if (filters.setor) {
          query = query.eq('setor', filters.setor)
      }
      if (filters.excludeAssignedTo) {
          query = query.or(`assigned_to.is.null,assigned_to.neq.${filters.excludeAssignedTo}`)
      }
      if (filters.emissor) {
        let orFilter = `emissor.ilike.%${filters.emissor}%,numero_ne.ilike.%${filters.emissor}%,numero_pedido.ilike.%${filters.emissor}%`
        try {
          const { data: ents } = await supabase
            .from('entidades')
            .select('id')
            .or(`nome.ilike.%${filters.emissor}%,municipio.ilike.%${filters.emissor}%`)
          if (ents && ents.length > 0) {
            const entityIds = ents.map(e => e.id)
            orFilter += `,entidade_id.in.(${entityIds.join(',')})`
          }
        } catch (err) {
          console.error('Erro ao buscar entidades na pesquisa de empenhos:', err)
        }
        query = query.or(orFilter)
      }
      if (filters.status) query = query.eq('status_geral', filters.status)
      if (filters.statusArray && filters.statusArray.length > 0) query = query.in('status_geral', filters.statusArray)
      if (filters.dataInicio) query = query.gte('data_emissao', filters.dataInicio.split('T')[0])
      if (filters.dataFim) query = query.lte('data_emissao', filters.dataFim.split('T')[0])
      if (filters.ownerId) {
        query = query.or(`owner_id.eq.${filters.ownerId},assigned_to.eq.${filters.ownerId}`)
      }
      
      // Filtros Regionais (na tabela Entidades e campo uf nativo)
      if (filters.estado) query = query.eq('uf', filters.estado)
      if (filters.municipio) query = query.ilike('entidades.municipio', `%${filters.municipio}%`)
      if (filters.nomeEntidade) query = query.ilike('entidades.nome', `%${filters.nomeEntidade}%`)
      if (filters.itemSearch) {
        query = query.ilike('itens.descricao', `%${filters.itemSearch}%`)
      }
      if (filters.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo)
      }
  }

  if (orderBy.column === 'emissor') {
    query = query
      .order('emissor', { ascending: true })
      .order('created_at', { ascending: false })
  } else {
    query = query.order(orderBy.column, { ascending: orderBy.ascending })
  }

  return query.range(from, to)
}

export async function fetchDashboardEmpenhos(
  filters?: {
    emissor?: string,
    setor?: string,
    status?: string,
    statusArray?: string[],
    dataInicio?: string,
    dataFim?: string,
    assignedTo?: string,
    excludeAssignedTo?: string,
    ownerId?: string,
    estado?: string,
    municipio?: string,
    nomeEntidade?: string,
    itemSearch?: string
  },
  userId?: string,
  restrictToUser?: boolean
) {
  let selectedColumns = 'id, valor_total_teto, status_geral, emissor, entidade_id, entidades(id, nome, municipio, estado), itens(id, quantidade, valor_unitario, historico_entregas(numero_nf, quantidade_entregue))'

  if (filters && (filters.estado || filters.municipio || filters.nomeEntidade)) {
    selectedColumns = selectedColumns.replace(/entidades\s*\(/g, 'entidades!inner(')
  }
  if (filters && filters.itemSearch) {
    selectedColumns = selectedColumns.replace(/itens\s*\(/g, 'itens!inner(')
  }

  let query = supabase.from('notas').select(selectedColumns)

  if (restrictToUser && userId) {
    query = query.or(`owner_id.eq.${userId},assigned_to.eq.${userId}`)
  }

  if (filters) {
    if (filters.setor) query = query.eq('setor', filters.setor)
    if (filters.excludeAssignedTo) query = query.or(`assigned_to.is.null,assigned_to.neq.${filters.excludeAssignedTo}`)
    if (filters.emissor) {
      let orFilter = `emissor.ilike.%${filters.emissor}%,numero_ne.ilike.%${filters.emissor}%,numero_pedido.ilike.%${filters.emissor}%`
      try {
        const { data: ents } = await supabase
          .from('entidades')
          .select('id')
          .or(`nome.ilike.%${filters.emissor}%,municipio.ilike.%${filters.emissor}%`)
        if (ents && ents.length > 0) {
          const entityIds = ents.map(e => e.id)
          orFilter += `,entidade_id.in.(${entityIds.join(',')})`
        }
      } catch (err) {
        console.error('Erro ao buscar entidades na pesquisa de dashboard:', err)
      }
      query = query.or(orFilter)
    }
    if (filters.status) query = query.eq('status_geral', filters.status)
    if (filters.statusArray && filters.statusArray.length > 0) query = query.in('status_geral', filters.statusArray)
    if (filters.dataInicio) query = query.gte('data_emissao', filters.dataInicio.split('T')[0])
    if (filters.dataFim) query = query.lte('data_emissao', filters.dataFim.split('T')[0])
    if (filters.ownerId) {
      query = query.or(`owner_id.eq.${filters.ownerId},assigned_to.eq.${filters.ownerId}`)
    }
    if (filters.estado) query = query.eq('uf', filters.estado)
    if (filters.municipio) query = query.ilike('entidades.municipio', `%${filters.municipio}%`)
    if (filters.nomeEntidade) query = query.ilike('entidades.nome', `%${filters.nomeEntidade}%`)
    if (filters.itemSearch) query = query.ilike('itens.descricao', `%${filters.itemSearch}%`)
    if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo)
  }

  return query
}

export async function deleteNota(id: number, user?: { id: string, email?: string }) {
  if (user) {
      const { error } = await supabase.from('notas').delete().eq('id', id)
      if (!error) await logOperation('DELETE', 'notas', String(id), { deleted_id: id }, user)
      return { error }
  }
  return supabase.from('notas').delete().eq('id', id)
}

// --- ITENS ---

export async function insertItens(
  rows: Database['public']['Tables']['itens']['Insert'][],
  user?: { id: string, email?: string }
) {
  const result = await supabase.from('itens').insert(rows).select()
  if (result.data && user) {
      for (const row of result.data) {
          await logOperation('CREATE', 'itens', String(row.id), row, user)
      }
  }
  return result
}

export async function updateItem(id: number, payload: Database['public']['Tables']['itens']['Update'], user?: { id: string, email?: string }) {
    const result = await supabase.from('itens').update(payload).eq('id', id).select().single()
    if (result.data && user) {
        await logOperation('UPDATE', 'itens', String(id), payload, user)
    }
    return result
}

// --- LOGÍSTICA / HISTÓRICO ---

export function fromHistorico() {
    return supabase.from('historico_entregas')
}

export async function insertHistorico(rows: Database['public']['Tables']['historico_entregas']['Insert'][], user?: { id: string, email?: string }) {
    const result = await supabase.from('historico_entregas').insert(rows).select()
    if (result.data && user) {
        for (const row of result.data) {
            await logOperation('CREATE', 'historico_entregas', String(row.id), row, user)
        }
    }
    return result
}

export async function insertPedidoCompra(row: Database['public']['Tables']['pedidos_compra']['Insert']) {
    return supabase.from('pedidos_compra').insert(row)
}

// --- SALDO DE ATAS (LÓGICA CORE) ---

/**
 * Calcula o saldo disponível em uma Ata de Registro de Preços.
 * Cruza dados de 'itens_ata' com o consumo registrado na tabela 'itens'.
 */
export async function fetchSaldoAta(ataId: string) {
  // 1. Busca os itens definidos na Ata
  const { data: itensAta, error: errorAta } = await supabase
      .from('itens_ata')
      .select('id, numero_item, descricao, unidade, quantidade_registrada, quantidade_abatida, valor_unitario, marca')
      .eq('ata_id', ataId)

  if (errorAta) throw errorAta
  if (!itensAta) return []

  // 2. Busca o consumo (empenhos) e o histórico de entregas de todos os itens vinculados a esta Ata
  const ids = itensAta.map(i => i.id)
  if (ids.length === 0) return []

  // 2. Busca o comprometimento (empenhos)
  const { data: itensEmpenho } = await supabase
      .from('itens')
      .select('item_ata_id, quantidade')
      .in('item_ata_id', ids)

  // 3. Busca o consumo real (entregas), incluindo vendas diretas (Fluxo Pré-Faturado)
  const { data: historico } = await supabase
      .from('historico_entregas')
      .select('item_ata_id, quantidade_entregue')
      .in('item_ata_id', ids)

  // 4. Agrega o consumo real (entregas) e o comprometimento (empenhos) por item
  const mapDados = new Map<number, { empenhado: number, entregue: number }>()
  
  itensEmpenho?.forEach(item => {
      if (item.item_ata_id) {
          const atual = mapDados.get(item.item_ata_id) || { empenhado: 0, entregue: 0 }
          mapDados.set(item.item_ata_id, {
              ...atual,
              empenhado: atual.empenhado + (item.quantidade || 0)
          })
      }
  })

  historico?.forEach(h => {
    if (h.item_ata_id) {
        const atual = mapDados.get(h.item_ata_id) || { empenhado: 0, entregue: 0 }
        mapDados.set(h.item_ata_id, {
            ...atual,
            entregue: atual.entregue + (h.quantidade_entregue || 0)
        })
    }
  })

  // 4. Calcula o saldo final (Real vs Reservado vs Empenhado + Abatimento Prévio)
  return itensAta.map(item => {
      const dados = mapDados.get(item.id) || { empenhado: 0, entregue: 0 }
      const totalRegistrado = item.quantidade_registrada || 0
      const abatimentoPrevio = (item as any).quantidade_abatida || 0
      
      const totalConsumido = dados.entregue + abatimentoPrevio
      const totalEmpenhadoOuAbatido = dados.empenhado + abatimentoPrevio

      return {
          ...item,
          quantidade_empenhada: totalEmpenhadoOuAbatido, // Total comprometido (Baixa Suave + Consumo Prévio)
          quantidade_consumida: totalConsumido, // Total consumido (Baixa NF/DAV + Consumo Prévio)
          quantidade_reservada: Math.max(0, dados.empenhado - dados.entregue),
          saldo_real: Math.max(0, totalRegistrado - totalConsumido),
          saldo_disponivel: Math.max(0, totalRegistrado - totalEmpenhadoOuAbatido) // Saldo livre para novos empenhos
      }
  })
}

/**
 * Verifica se uma Ata possui consumo (empenhos) vinculado.
 * Retorna true se houver consumo, false caso contrário.
 */
export async function checkAtaConsumption(ataId: string) {
    // 1. Verificar se alguma Nota (Empenho) aponta diretamente para esta Ata
    const { count: countNotas, error: errorNotas } = await supabase
        .from('notas')
        .select('*', { count: 'exact', head: true })
        .eq('ata_id', ataId)
    
    if (errorNotas) throw errorNotas
    if ((countNotas || 0) > 0) return true

    // 2. Verificar se algum item da Ata está sendo consumido (atividades vinculadas a itens_ata)
    const { data: itensAta, error } = await supabase
        .from('itens_ata')
        .select('id')
        .eq('ata_id', ataId)
    
    if (error || !itensAta || itensAta.length === 0) return false

    const ids = itensAta.map(i => i.id)
    const { count, error: errorCount } = await supabase
        .from('itens')
        .select('*', { count: 'exact', head: true })
        .in('item_ata_id', ids)

    if (errorCount) return false
    return (count || 0) > 0
}

// --- ENTIDADES (CLIENTES) ---

export async function fetchEntidades(_userId?: string) {
    return supabase.from('entidades').select('*, creator:profiles(display_name, email)').order('nome')
}

export async function findOrCreateEntidade(
    nome: string, 
    estado?: string, 
    userId?: string, 
    municipio?: string, 
    regiao?: string,
    cnpj?: string
) {
    const cleanCnpj = (cnpj || '').replace(/\D/g, '')

    const isSesauCnpj = cleanCnpj === '13849028000140'
    const hasCategoryPrefix = nome.trim().startsWith('(')

    // 1. Tenta buscar por CNPJ primeiro (âncora principal contra duplicidade)
    if (cleanCnpj && cleanCnpj.length >= 14 && !isSesauCnpj && !hasCategoryPrefix) {
        const { data: porCnpj } = await supabase
            .from('entidades')
            .select('*')
            .eq('cnpj', cleanCnpj)
            .maybeSingle()
        
        if (porCnpj) {
            // Opcional: Atualizar campos faltantes se encontrarmos pelo CNPJ
            return porCnpj
        }
    }

    // 2. Tenta buscar por nome exato (case-insensitive)
    const { data: existente } = await supabase
        .from('entidades')
        .select('*')
        .ilike('nome', nome.trim())
        .maybeSingle()

    if (existente) {
        const updates: any = {}
        // Se encontramos pelo nome mas não tínhamos o CNPJ, podemos salvar agora
        if (!existente.cnpj && cleanCnpj) {
            updates.cnpj = cleanCnpj
        }

        // Auto-correção: Se o município cadastrado for nulo, vazio ou "Inhumas" (falso positivo anterior),
        // e o município recebido agora for válido e diferente de Inhumas, atualiza no banco
        const currentMunicipality = (existente.municipio || '').toLowerCase().trim()
        const incomingMunicipality = (municipio || '').trim()
        if (incomingMunicipality && 
            !incomingMunicipality.toLowerCase().includes('inhumas') && 
            (!currentMunicipality || currentMunicipality.includes('inhumas'))) {
            updates.municipio = incomingMunicipality
            if (estado) updates.estado = estado
            if (regiao) updates.regiao = regiao
        }

        // Auto-correção de nome genérico: se for FMS, Prefeitura, etc., sem o nome do município, complementa
        const resolvedMun = updates.municipio || existente.municipio
        if (resolvedMun) {
            const genericNames = [
                'FUNDO MUNICIPAL DE SAÚDE',
                'FUNDO MUNICIPAL DE SAUDE',
                'SECRETARIA MUNICIPAL DE SAÚDE',
                'SECRETARIA MUNICIPAL DE SAUDE',
                'FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL',
                'FUNDO MUNICIPAL DE ASSISTENCIA SOCIAL',
                'FUNDO MUNICIPAL DE EDUCAÇÃO',
                'FUNDO MUNICIPAL DE EDUCACAO',
                'PREFEITURA MUNICIPAL',
                'PREFEITURA'
            ]
            const currentNameUpper = existente.nome.toUpperCase().trim()
            const munUpper = resolvedMun.toUpperCase().trim()
            if (genericNames.includes(currentNameUpper) && !currentNameUpper.includes(munUpper)) {
                updates.nome = `${existente.nome.trim()} de ${resolvedMun}`
            }
        }

        if (Object.keys(updates).length > 0) {
            const { data: updated } = await supabase
                .from('entidades')
                .update(updates)
                .eq('id', existente.id)
                .select()
                .maybeSingle()
            if (updated) return updated
        }
        return existente
    }

    // 3. Se não existir, cria com os dados territoriais e CNPJ
    let finalNome = nome.trim()
    if (municipio) {
        const genericNames = [
            'FUNDO MUNICIPAL DE SAÚDE',
            'FUNDO MUNICIPAL DE SAUDE',
            'SECRETARIA MUNICIPAL DE SAÚDE',
            'SECRETARIA MUNICIPAL DE SAUDE',
            'FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL',
            'FUNDO MUNICIPAL DE ASSISTENCIA SOCIAL',
            'FUNDO MUNICIPAL DE EDUCAÇÃO',
            'FUNDO MUNICIPAL DE EDUCACAO',
            'PREFEITURA MUNICIPAL',
            'PREFEITURA'
        ]
        const nomeUpper = finalNome.toUpperCase()
        const munUpper = municipio.toUpperCase().trim()
        if (genericNames.includes(nomeUpper) && !nomeUpper.includes(munUpper)) {
            finalNome = `${finalNome} de ${municipio}`
        }
    }

    const { data: nova, error } = await supabase
        .from('entidades')
        .insert([{ 
            nome: finalNome, 
            estado: estado || null, 
            municipio: municipio || null,
            regiao: regiao || null,
            cnpj: cleanCnpj || null,
    owner_id: userId 
        }])
        .select()
        .single()

    if (error) throw error
    return nova
}

export async function mergeEntidades(targetId: number, targetName: string, sourceIds: number[], user?: { id: string, email?: string }) {
    const norm = (s: string | null | undefined) => (s || '').trim().toUpperCase()

    // 1a. Buscar notas existentes no destino
    const { data: notasDestino } = await supabase
        .from('notas')
        .select('id, numero_ne')
        .eq('entidade_id', targetId)

    const targetNeMap = new Map<string, number>()
    for (const n of (notasDestino || [])) {
        if (n.numero_ne) {
            targetNeMap.set(norm(n.numero_ne), n.id)
        }
    }

    // 1b. Buscar notas das entidades fontes
    const { data: notasFonte, error: errNotasFonte } = await supabase
        .from('notas')
        .select('id, numero_ne, entidade_id')
        .in('entidade_id', sourceIds)

    if (errNotasFonte) return { error: errNotasFonte }

    // 1c. Processar cada nota das fontes
    const notasParaAtualizar: number[] = []

    for (const nota of (notasFonte || [])) {
        const key = norm(nota.numero_ne)
        if (key && targetNeMap.has(key)) {
            const destNotaId = targetNeMap.get(key)!
            
            // Reatribui todos os itens da nota duplicada para a nota destino
            const { error: errMoveItens } = await supabase
                .from('itens')
                .update({ nota_id: destNotaId })
                .eq('nota_id', nota.id)

            if (errMoveItens) return { error: errMoveItens }

            // Recalcula o status da nota destino
            await refreshNotaStatus(destNotaId)

            // Deleta a nota fonte agora sem itens
            const { error: errDelNota } = await supabase
                .from('notas')
                .delete()
                .eq('id', nota.id)

            if (errDelNota) return { error: errDelNota }
        } else {
            // Sem duplicata até o momento: esta nota será movida para o destino
            notasParaAtualizar.push(nota.id)
            if (key) {
                targetNeMap.set(key, nota.id)
            }
        }
    }

    // Mover notas únicas restantes para o destino
    if (notasParaAtualizar.length > 0) {
        const { error: errNotas } = await supabase
            .from('notas')
            .update({ entidade_id: targetId, emissor: targetName })
            .in('id', notasParaAtualizar)
        
        if (errNotas) return { error: errNotas }
    }

    // 2. Atualizar atas (Arps) — a coluna correta é numero_arp
    const { data: atasDestino } = await supabase
        .from('atas')
        .select('id, numero_arp')
        .eq('entidade_id', targetId)

    const ataExistentesNoDestino = new Set((atasDestino || []).map((a: any) => norm(a.numero_arp)))

    if (ataExistentesNoDestino.size > 0) {
        const { error: errDeleteAtaDup } = await supabase
            .from('atas')
            .delete()
            .in('entidade_id', sourceIds)
            .in('numero_arp', Array.from(ataExistentesNoDestino))

        if (errDeleteAtaDup) return { error: errDeleteAtaDup }
    }

    const { error: errAtas } = await supabase
        .from('atas')
        .update({ entidade_id: targetId })
        .in('entidade_id', sourceIds)
    
    if (errAtas) return { error: errAtas }

    // 3. Remover entidades duplicadas
    const { error: errDelete } = await supabase
        .from('entidades')
        .delete()
        .in('id', sourceIds)

    if (errDelete) return { error: errDelete }

    // 4. Logar ação
    if (user) {
        await logOperation('UPDATE', 'entidades', String(targetId), {
            action: 'MERGE_ENTIDADES',
            target_id: targetId,
            target_name: targetName,
            source_ids: sourceIds
        }, user)
    }

    return { error: null }
}

export async function fetchSaldoContrato(contratoId: string) {
  // 1. Busca os itens definidos no Contrato
  const { data: itensContrato, error: errorContrato } = await supabase
      .from('itens_contrato')
      .select('id, item_ata_id, numero_item, descricao, unidade, quantidade_contratada, valor_unitario, marca')
      .eq('contrato_id', contratoId)

  if (errorContrato) throw errorContrato
  if (!itensContrato) return []

  // 2. Busca o comprometimento (itens de empenho vinculados)
  const ids = itensContrato.map(i => i.id)
  if (ids.length === 0) return []

  const { data: itensEmpenho } = await supabase
      .from('itens')
      .select('id, item_contrato_id, quantidade')
      .in('item_contrato_id', ids)

  // 3. Busca as entregas reais (unindo com historico_entregas pelo item_id)
  const itemEmpenhoIds = itensEmpenho?.map(ie => ie.id) || []
  let historico: any[] = []
  if (itemEmpenhoIds.length > 0) {
      const { data: histData } = await supabase
          .from('historico_entregas')
          .select('item_id, quantidade_entregue')
          .in('item_id', itemEmpenhoIds)
      if (histData) historico = histData
  }

  // 4. Agrega o empenhado e o entregue por item de contrato
  const mapDados = new Map<string, { empenhado: number, entregue: number }>()

  const itemToContratoMap = new Map<number, string>()
  itensEmpenho?.forEach(ie => {
      if (ie.item_contrato_id) {
          itemToContratoMap.set(ie.id, ie.item_contrato_id)
          const atual = mapDados.get(ie.item_contrato_id) || { empenhado: 0, entregue: 0 }
          mapDados.set(ie.item_contrato_id, {
              ...atual,
              empenhado: atual.empenhado + (ie.quantidade || 0)
          })
      }
  })

  historico.forEach(h => {
      if (h.item_id) {
          const itemContratoId = itemToContratoMap.get(h.item_id)
          if (itemContratoId) {
              const atual = mapDados.get(itemContratoId) || { empenhado: 0, entregue: 0 }
              mapDados.set(itemContratoId, {
                  ...atual,
                  entregue: atual.entregue + (h.quantidade_entregue || 0)
              })
          }
      }
  })

  // 5. Calcula o saldo final (Real vs Reservado)
  return itensContrato.map(item => {
      const dados = mapDados.get(item.id) || { empenhado: 0, entregue: 0 }
      const totalRegistrado = item.quantidade_contratada || 0

      return {
          ...item,
          quantidade_consumida: dados.entregue,
          quantidade_reservada: dados.empenhado - dados.entregue,
          saldo_real: totalRegistrado - dados.entregue,
          saldo_disponivel: totalRegistrado - dados.empenhado
      }
  })
}

export default {
    insertNotas,
    insertAndSelectNota,
    updateNota,
    selectAllNotas,
    deleteNota,
    insertItens,
    fetchSaldoAta,
    fetchSaldoContrato,
    logOperation,
    fetchEntidades,
    findOrCreateEntidade,
    mergeEntidades
}
// --- GESTÃO DE USUÁRIOS E ATRIBUIÇÃO ---

export async function getProfiles() {
    return supabase
        .from('profiles')
        .select('id, display_name, email, setor, nivel')
        .neq('setor', 'VENDAS_PRIVADO')
        .order('display_name')
}

export async function assignNota(notaId: number, userId: string | null) {
    const { error } = await supabase
        .from('notas')
        .update({ 
            assigned_to: userId,
            distributed_at: userId ? new Date().toISOString() : null,
            status_carga: userId ? 'RECEBIDO' : 'AGUARDANDO_DISTRIBUICAO',
            confirmed_at: userId ? new Date().toISOString() : null
        })
        .eq('id', notaId)
    
    return { error }
}

export async function confirmReceipt(notaId: number) {
    const { error } = await supabase
        .from('notas')
        .update({ 
            status_carga: 'RECEBIDO',
            confirmed_at: new Date().toISOString()
        })
        .eq('id', notaId)
    
    return { error }
}

export async function assignEntidade(entidadeId: number | null, emissor: string, userId: string | null) {
    let query = supabase.from('notas').update({ 
        assigned_to: userId,
        distributed_at: userId ? new Date().toISOString() : null,
        status_carga: userId ? 'RECEBIDO' : 'AGUARDANDO_DISTRIBUICAO',
        confirmed_at: userId ? new Date().toISOString() : null
    })

    if (entidadeId) {
        query = query.eq('entidade_id', entidadeId)
    } else {
        query = query.eq('emissor', emissor)
    }
    
    return query
}

/**
 * Busca o histórico de abatimento (entregas) vinculado a um item de Ata específico.
 */
export async function fetchAbatimentosItem(itemId: number) {
    return supabase
        .from('historico_entregas')
        .select(`
            id,
            quantidade_entregue,
            created_at,
            venda_tipo,
            numero_nf,
            motivo_pendencia,
            item:itens(
                id,
                nota:notas(
                    id,
                    numero_ne,
                    emissor
                )
            )
        `)
        .eq('item_ata_id', itemId)
        .order('created_at', { ascending: false })
}
/**
 * Recalcula o status_geral de um empenho (nota) com base no progresso das entregas de seus itens.
 * Define como CONCLUIDO se 100% entregue, EM_ANDAMENTO se parcial, ou PENDENTE se nada foi entregue.
 */
export async function refreshNotaStatus(notaId: number) {
    // 1. Buscar todos os itens e suas entregas
    const { data: itens, error } = await supabase
        .from('itens')
        .select('quantidade, historico_entregas(quantidade_entregue, motivo_pendencia)')
        .eq('nota_id', notaId)

    if (error || !itens || itens.length === 0) return

    // 1.1. Buscar a nota e sua entidade para verificar se é de Teresina
    const { data: notaInfo } = await supabase
        .from('notas')
        .select('emissor, entidades(nome, municipio)')
        .eq('id', notaId)
        .maybeSingle()

    const emissor = String(notaInfo?.emissor || '').toLowerCase()
    const entidadeNome = String((notaInfo?.entidades as any)?.nome || '').toLowerCase()
    const entidadeMunicipio = String((notaInfo?.entidades as any)?.municipio || '').toLowerCase()
    const isNotaTeresina = emissor.includes('teresina') || 
                           entidadeNome.includes('teresina') || 
                           entidadeMunicipio.includes('teresina')

    // 2. Calcular se está tudo entregue ou finalizado por fator caixa
    let totalPedido = 0
    let totalEntregue = 0
    let hasFatorCaixaInHistory = false
    let allItemsFinalized = true
    
    itens.forEach(item => {
        const pedido = (Number(item.quantidade) || 0)
        totalPedido += pedido
        
        const entregas = (item.historico_entregas as unknown as any[]) || []
        const itemEntregue = entregas.reduce((acc, curr) => acc + (Number(curr.quantidade_entregue) || 0), 0)
        totalEntregue += itemEntregue

        let isItemFatorCaixa = entregas.some(curr => curr.motivo_pendencia?.includes('Fator Caixa'))
        
        if (isNotaTeresina) {
            isItemFatorCaixa = false
        }

        if (itemEntregue < pedido && !isItemFatorCaixa) {
            allItemsFinalized = false
        }
        
        if (isItemFatorCaixa) {
            hasFatorCaixaInHistory = true
        }
    })

    if (totalPedido === 0) return

    // 3. Definir novo status
    let novoStatus = 'PENDENTE'
    
    if (allItemsFinalized) {
        novoStatus = hasFatorCaixaInHistory ? 'FATOR_CAIXA' : 'CONCLUIDO'
    } else if (totalEntregue > 0) {
        novoStatus = 'EM_ANDAMENTO'
    }

    // 4. Buscar status atual para evitar sobrescrever status especiais (como CANCELADO)
    const { data: notaAtual } = await supabase
        .from('notas')
        .select('status_geral')
        .eq('id', notaId)
        .single()

    if (notaAtual?.status_geral === 'CONCLUIDO_MANUAL') {
        return
    }

    // Proteção: um empenho CANCELADO sem nenhuma entrega deve permanecer CANCELADO.
    // Mas se houver entregas (parcial ou total), o status deve refletir a realidade.
    if (notaAtual?.status_geral === 'CANCELADO' && novoStatus === 'PENDENTE') {
        return
    }

    if (notaAtual?.status_geral !== novoStatus) {
        const updates: any = { status_geral: novoStatus }
        if (novoStatus === 'CONCLUIDO' || novoStatus === 'FATOR_CAIXA') {
            updates.e_notificacao = false
        }
        await supabase
            .from('notas')
            .update(updates)
            .eq('id', notaId)
    }
}

/**
 * Busca o vendedor (assigned_to) mais frequente ou recente para uma entidade,
 * analisando o histórico de empenhos dessa prefeitura.
 */
export async function getSuggestedAssigneesForEntidade(entidadeId: string | number) {
  if (!entidadeId) return []

  const { data, error } = await supabase
    .from('notas')
    .select('assigned_to, created_at, profiles!notas_assigned_to_fkey(id, display_name)')
    .eq('entidade_id', String(entidadeId) as any)
    .not('assigned_to', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) {
    console.error('Erro ao buscar histórico de atribuição:', error)
    return []
  }

  // Agrupar e garantir unicidade
  const uniqueAssignees = new Map<string, { id: string, name: string }>()
  
  for (const row of data) {
    if (row.assigned_to && row.profiles) {
      if (!uniqueAssignees.has(row.assigned_to)) {
        uniqueAssignees.set(row.assigned_to, {
          id: row.assigned_to,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          name: (row.profiles as any).display_name || 'Usuário'
        })
      }
    }
  }

  return Array.from(uniqueAssignees.values())
}

export interface NFCheckResult {
  exists: boolean
  isLoose: boolean
  numero_nf: string
}

/**
 * Verifica se uma Nota Fiscal já foi importada no sistema.
 */
export async function verificarDuplicidadeNf(numeroNf: string): Promise<NFCheckResult> {
  if (!numeroNf || !numeroNf.trim()) return { exists: false, isLoose: false, numero_nf: '' }
  const cleanNf = numeroNf.trim()

  const { data, error } = await supabase
    .from('historico_entregas')
    .select('id, item_id, numero_nf')
    .ilike('numero_nf', cleanNf)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Erro ao verificar duplicidade de NF:', error)
    return { exists: false, isLoose: false, numero_nf: cleanNf }
  }

  if (!data) {
    return { exists: false, isLoose: false, numero_nf: cleanNf }
  }

  return {
    exists: true,
    isLoose: data.item_id === null || data.item_id === undefined,
    numero_nf: data.numero_nf || cleanNf
  }
}

