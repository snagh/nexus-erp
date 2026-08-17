import { supabase } from './supabase'

export const SUBCATEGORIAS_OPCOES = [
  'Agulhas & Seringas',
  'Antibióticos',
  'Analgesicos & Anti-inflamatórios',
  'Analgésicos & Anestésicos',
  'Cardiovascular',
  'Curativos & Gaze',
  'Descartáveis',
  'Dermatológicos',
  'Diagnóstico & Reagentes',
  'Equipos & Cateteres',
  'Fraldas & Higiene',
  'Higiene & Antissepsia',
  'Injetáveis',
  'Luvas & EPIs',
  'Medicamentos Orais',
  'Mobiliário Hospitalar',
  'Odontológico',
  'Soluções Parenterais',
  'Soluções Tópicas',
  'Sondas & Tubos',
  'Outros'
]

/**
 * Deduz a subcategoria de maior recorrência no acervo da empresa para cada item fornecido.
 */
export async function autoDeduceSubcategories<T extends { descricao?: string; subcategoria?: string | null }>(itens: T[]): Promise<T[]> {
  if (!itens || itens.length === 0) return itens;

  try {
    // Buscar histórico de subcategorias já atribuídas no banco de dados
    const { data: dbItens } = await supabase
      .from('itens_ata')
      .select('descricao, subcategoria')
      .not('subcategoria', 'is', null)

    const { data: dbEmpenhoItens } = await supabase
      .from('itens')
      .select('descricao, subcategoria')
      .not('subcategoria', 'is', null)

    const allHistory: Array<{ descricao?: string | null; subcategoria?: string | null }> = [
      ...((dbItens || []) as any[]),
      ...((dbEmpenhoItens || []) as any[])
    ]

    if (allHistory.length === 0) return itens;

    // Criar mapa de frequência: palavra significativa -> subcategoria -> contagem
    const termSubcatMap: Record<string, Record<string, number>> = {}

    allHistory.forEach(row => {
      if (!row || !row.subcategoria || !row.descricao) return
      const subcat = String(row.subcategoria).trim()
      if (!subcat) return

      const cleanDesc = String(row.descricao)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      
      // Tokens de 4 ou mais letras
      const words = Array.from(new Set(cleanDesc.split(/\W+/).filter((w: string) => w.length >= 4)))
      
      words.forEach((w: string) => {
        if (!termSubcatMap[w]) termSubcatMap[w] = {}
        termSubcatMap[w][subcat] = (termSubcatMap[w][subcat] || 0) + 1
      })
    })

    return itens.map(it => {
      if (it.subcategoria && it.subcategoria.trim()) return it

      const desc = (it.descricao || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      
      const words = Array.from(new Set(desc.split(/\W+/).filter((w: string) => w.length >= 4)))
      
      const scores: Record<string, number> = {}
      words.forEach((w: string) => {
        if (termSubcatMap[w]) {
          Object.entries(termSubcatMap[w]).forEach(([subcat, count]) => {
            scores[subcat] = (scores[subcat] || 0) + count
          })
        }
      })

      let bestSubcat: string | null = null
      let maxScore = 0

      Object.entries(scores).forEach(([subcat, score]) => {
        if (score > maxScore) {
          maxScore = score
          bestSubcat = subcat
        }
      })

      return {
        ...it,
        subcategoria: bestSubcat || null
      }
    })
  } catch (err) {
    console.warn('[Nexus Subcategoria] Falha ao inferir por recorrência:', err)
    return itens
  }
}

/**
 * Determina a subcategoria da ATA inteira com base na moda (subcategoria / produto mais frequente entre os itens).
 */
export async function deduceAtaSubcategory<T extends { descricao?: string; subcategoria?: string | null }>(itens: T[]): Promise<string | null> {
  if (!itens || itens.length === 0) return null;

  const itensComSubcat = await autoDeduceSubcategories(itens);
  const counts: Record<string, number> = {};

  itensComSubcat.forEach(it => {
    let sub = (it.subcategoria || '').trim();

    if (!sub && it.descricao) {
      const upper = it.descricao.toUpperCase();
      if (upper.includes('FRALDA')) sub = 'Fraldas & Higiene';
      else if (upper.includes('LUVA')) sub = 'Luvas & EPIs';
      else if (upper.includes('SERINGA') || upper.includes('AGULHA')) sub = 'Agulhas & Seringas';
      else if (upper.includes('GAZE') || upper.includes('ATADURA') || upper.includes('CURATIVO')) sub = 'Curativos & Gaze';
      else if (upper.includes('EQUIPO') || upper.includes('CATETER')) sub = 'Equipos & Cateteres';
      else if (upper.includes('SOLUCAO') || upper.includes('SORO')) sub = 'Soluções Parenterais';
      else if (upper.includes('CADEIRA') || upper.includes('MESA') || upper.includes('LEITO')) sub = 'Mobiliário Hospitalar';
      else if (upper.includes('DETERGENTE') || upper.includes('SABAO') || upper.includes('ALCOOL')) sub = 'Higiene & Antissepsia';
    }

    if (sub) {
      counts[sub] = (counts[sub] || 0) + 1;
    }
  });

  let bestSubcat: string | null = null;
  let maxCount = 0;

  Object.entries(counts).forEach(([sub, count]) => {
    if (count > maxCount) {
      maxCount = count;
      bestSubcat = sub;
    }
  });

  return bestSubcat;
}
