import { useState, useEffect, useMemo, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { 
  FileUp, 
  Sparkles, 
  Upload, 
  Save,
  Loader2,
  PackageCheck,
  Search,
  Trash2,
  FileText,
  Link2
} from 'lucide-react'

import { autoDeduceSubcategories, deduceAtaSubcategory, SUBCATEGORIAS_OPCOES } from '../lib/subcatResolver'

// Shadcn UI Components
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Progress } from '../components/ui/progress'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../components/ui/table'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../components/ui/select'

import { 
    fetchEntidades, 
    findOrCreateEntidade,
    getSuggestedAssigneesForEntidade
} from '../lib/supabaseHelpers'
import { toast } from 'sonner'
import { analyzeWithAI } from '../aiService' 
import { ProductAutocomplete } from '../components/ui/ProductAutocomplete' 
import { cleanCurrency, parseBrazilianNumber, normalizeState, getStateRegion, sanitizeMunicipality } from '../lib/utils'
import { useAuth } from '../AuthContext'
import type { Tables } from '../supabaseTypes'

interface CriarNotaProps {
  aoSalvar?: () => void
}

interface ItemTemp {
    posicao?: string
    descricao: string
    quantidade: number
    quantidade_inicial?: number
    quantidade_abatida?: number
    saldo_disponivel?: number
    unidade: string
    valor_unitario: number
    valor_total?: number
    valor_total_disponivel?: number
    marca?: string
    lote?: string
    codigo?: string
    codigo_item?: string
    categoria: string
    subcategoria?: string | null
    codigo_mapeamento_ia?: string
    fornecedor?: string
    produto_catalogo_id?: number | null
    vencidoPorEmpresaAlvo?: boolean
    paginaOriginal?: number
}

const BR_STATES = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

function extractPageText(pageTextContent: any, pageNum: number): string {
  const textItems = (pageTextContent?.items || []) as any[]
  
  // Agrupar itens por coordenada Y arredondada
  const linesMap: Record<number, any[]> = {}
  textItems.forEach((item) => {
    if (!item || typeof item.str !== 'string') return
    const y = item.transform ? Math.round(item.transform[5]) : 0
    if (!linesMap[y]) {
      linesMap[y] = []
    }
    linesMap[y].push(item)
  })

  // Ordenar as chaves Y de forma decrescente
  const sortedYs = Object.keys(linesMap)
    .map(Number)
    .sort((a, b) => b - a)

  // Unir itens da mesma linha separados por | e ordenados horizontalmente por X
  return sortedYs
    .map((y) => {
      const lineItems = linesMap[y]
      lineItems.sort((a, b) => {
        const ax = a.transform ? a.transform[4] : 0
        const bx = b.transform ? b.transform[4] : 0
        return ax - bx
      })
      const lineText = lineItems.map((item) => item.str.trim()).filter(Boolean).join(' | ')
      return `[PG:${pageNum}] ${lineText}`
    })
    .filter(Boolean)
    .join('\n')
}

interface ItemAtaValido {
  numero?: number | string | null
  descricao: string
  quantidade: number
  unidade: string
  valor_unitario: number
  valor_total: number
  marca?: string | null
  lote?: string | null
  codigo?: string | null
  codigo_item?: string | null
  categoria: string
  codigo_mapeamento_ia?: string | null
  fornecedor: string
  vencidoPorEmpresaAlvo?: boolean
  paginaOriginal?: number
}

function isValidItemAta(item: any): item is ItemAtaValido {
  return (
    item &&
    typeof item.descricao === 'string' &&
    item.descricao.trim().length >= 5 &&
    typeof item.quantidade === 'number' &&
    !isNaN(item.quantidade) &&
    item.quantidade > 0 &&
    typeof item.valor_unitario === 'number' &&
    !isNaN(item.valor_unitario) &&
    item.valor_unitario > 0
  );
}

async function linkItemsToCatalog(items: ItemTemp[]): Promise<ItemTemp[]> {
  try {
    const { data: catalog, error } = await supabase
      .from('catalogo_produtos')
      .select('id, codigo_interno, descricao_completa, descricao_resumida, unidade_venda, grupo')
    if (error || !catalog) return items

    return items.map(it => {
      const descClean = (it.descricao || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
      const codeClean = (it.codigo || it.codigo_item || '').trim().toLowerCase()

      // 1. Tenta buscar pelo código interno exato se houver
      if (codeClean) {
        const matchByCode = catalog.find(c => (c.codigo_interno || '').trim().toLowerCase() === codeClean)
        if (matchByCode) {
          return {
            ...it,
            produto_catalogo_id: matchByCode.id,
            unidade: matchByCode.unidade_venda || it.unidade,
            categoria: matchByCode.grupo ? matchByCode.grupo.toUpperCase() : it.categoria
          }
        }
      }

      // 2. Tenta buscar por descrição completa idêntica
      const matchExactDesc = catalog.find(c => 
        (c.descricao_completa || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() === descClean
      )
      if (matchExactDesc) {
        return {
          ...it,
          produto_catalogo_id: matchExactDesc.id,
          unidade: matchExactDesc.unidade_venda || it.unidade,
          categoria: matchExactDesc.grupo ? matchExactDesc.grupo.toUpperCase() : it.categoria
        }
      }

      // 3. Tenta buscar por substring de descrição (se uma contém a outra)
      const matchSubstring = catalog.find(c => {
        const cDesc = (c.descricao_completa || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        const cRes = (c.descricao_resumida || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        return (cDesc.length > 5 && (cDesc.includes(descClean) || descClean.includes(cDesc))) ||
               (cRes.length > 5 && (cRes.includes(descClean) || descClean.includes(cRes)))
      })
      if (matchSubstring) {
        return {
          ...it,
          produto_catalogo_id: matchSubstring.id,
          unidade: matchSubstring.unidade_venda || it.unidade,
          categoria: matchSubstring.grupo ? matchSubstring.grupo.toUpperCase() : it.categoria
        }
      }

      return it
    })
  } catch (err) {
    console.error('Error linking items to catalog:', err)
    return items
  }
}

export function CriarAta({ aoSalvar }: CriarNotaProps) {
  const navigate = useNavigate()
  const { canCreate, isOP } = useAuth()
  // --- Estados ---
  const [entidades, setEntidades] = useState<Tables<'entidades'>[]>([])
  
  // Carregamento de Cache Inicial
  const cachedData = JSON.parse(localStorage.getItem('form_cache_dados_ata') || '{}')

  const [entidadeSelecionada, setEntidadeSelecionada] = useState(cachedData.entidadeSelecionada || '')
  const [numeroArp, setNumeroArp] = useState(cachedData.numeroArp || '')
  const [emissor, setEmissor] = useState(cachedData.emissor || '')
  const [valorTeto, setValorTeto] = useState(cachedData.valorTeto || '')
  
  const [tipoDoc, setTipoDoc] = useState<'ATA' | 'CONTRATO' | 'ADESAO' | 'ADITIVO'>('ATA')
  const [parentAtaId, setParentAtaId] = useState<string | null>(null)
  const [parentAtas, setParentAtas] = useState<{ id: string; numero_arp: string; entidade_gerenciadora: string | null }[]>([])
  const [dataEmissao, setDataEmissao] = useState(cachedData.dataEmissao || '')
  const [prazoDias, setPrazoDias] = useState(cachedData.prazoDias || '365')
  const [dataValidade, setDataValidade] = useState(cachedData.dataValidade || '')
  const [uf, setUf] = useState(cachedData.uf || '')
  const [municipio, setMunicipio] = useState(cachedData.municipio || '')
  const [cnpj, setCnpj] = useState(cachedData.cnpj || '')
  const [regiao, setRegiao] = useState(cachedData.regiao || '')
  const [objetoAta, setObjetoAta] = useState(cachedData.objetoAta || '')
  const [subcategoriaAta, setSubcategoriaAta] = useState<string | null>(cachedData.subcategoriaAta || null)
  const [assignedTo, setAssignedTo] = useState(cachedData.assignedTo || '')
  const [users, setUsers] = useState<Tables<'profiles'>[]>([])

  const [loading, setLoading] = useState(false)
  const [loadingIA, setLoadingIA] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const [arquivo, setArquivo] = useState<File | null>(null)
  
  const [itensIA, setItensIA] = useState<ItemTemp[]>(() => {
    const cached = localStorage.getItem('form_cache_itens_ata')
    return cached ? JSON.parse(cached) : []
  })
  const [progress, setProgress] = useState(0)
  const [statusLog, setStatusLog] = useState('')
  const [isOpenClientDropdown, setIsOpenClientDropdown] = useState(false)
  const clientContainerRef = useRef<HTMLDivElement>(null)

  const [valorTotalSaldoDisponivel, setValorTotalSaldoDisponivel] = useState<number | null>(null)

  useEffect(() => {
    async function loadParentAtas() {
      const { data } = await supabase
        .from('atas')
        .select('id, numero_arp, entidade_gerenciadora')
        .order('created_at', { ascending: false })
      if (data) setParentAtas(data as any)
    }
    loadParentAtas()
  }, [])

  // Cálculo automático de Data de Vigência a partir da Data de Assinatura + Prazo em dias
  useEffect(() => {
    if (dataEmissao && prazoDias && Number(prazoDias) > 0) {
      const d = new Date(dataEmissao)
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + Number(prazoDias))
        const calcValidade = d.toISOString().split('T')[0]
        setDataValidade(calcValidade)
      }
    }
  }, [dataEmissao, prazoDias])

  const handleDataValidadeChange = (val: string) => {
    setDataValidade(val)
    if (dataEmissao && val) {
      const d1 = new Date(dataEmissao)
      const d2 = new Date(val)
      const diffTime = d2.getTime() - d1.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      if (diffDays > 0) {
        setPrazoDias(String(diffDays))
      }
    }
  }

  const recalcularTeto = (itens: ItemTemp[]) => {
    const total = itens.reduce((acc, it) => acc + (Number(it.quantidade || 0) * Number(it.valor_unitario || 0)), 0)
    const totalSaldo = itens.reduce((acc, it) => acc + (Number(it.saldo_disponivel !== undefined ? it.saldo_disponivel : it.quantidade || 0) * Number(it.valor_unitario || 0)), 0)
    setValorTeto(total.toFixed(2))
    setValorTotalSaldoDisponivel(totalSaldo)
  }

  const handleAdicionarItemManual = () => {
    const novo: ItemTemp = {
      posicao: String(itensIA.length + 1),
      descricao: 'NOVO ITEM INCLUÍDO MANUALMENTE',
      quantidade: 1,
      unidade: 'UN',
      valor_unitario: 1.00,
      valor_total: 1.00,
      categoria: 'MEDICAMENTO',
      fornecedor: 'ROSAFARM (Consolidado)'
    }
    const novaLista = [...itensIA, novo]
    setItensIA(novaLista)
    recalcularTeto(novaLista)
    toast.success('Novo item adicionado! Você pode alterar descrição, quantidade e valor na tabela.')
  }

  const handleRemoverItem = (index: number) => {
    const novaLista = itensIA.filter((_, idx) => idx !== index)
    setItensIA(novaLista)
    recalcularTeto(novaLista)
    toast.success('Item removido.')
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clientContainerRef.current && !clientContainerRef.current.contains(event.target as Node)) {
        setIsOpenClientDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredEntidades = useMemo(() => {
    if (!emissor) return entidades
    const term = emissor.toLowerCase()
    return entidades.filter(e =>
      e.nome.toLowerCase().includes(term) ||
      (e.municipio || '').toLowerCase().includes(term)
    )
  }, [entidades, emissor])

  useEffect(() => {
    async function loadSuggestedAssignee() {
      if (!entidadeSelecionada || entidadeSelecionada === 'new') return
      
      const suggestions = await getSuggestedAssigneesForEntidade(entidadeSelecionada)
      
      if (suggestions.length > 0) {
        // Se ainda não tiver atribuição ou se a atribuição atual não estiver na lista de sugestões
        if (!assignedTo || !suggestions.find(s => s.id === assignedTo)) {
           setAssignedTo(suggestions[0].id)
           // Exibir um toast apenas se houver mais de um e a gente escolheu o primeiro, 
           // ou apenas para avisar que auto-atribuiu
           if (suggestions.length > 1) {
             toast.info(`Vendedor sugerido automaticamente. Existem ${suggestions.length} vendedores vinculados a este cliente. Verifique a lista de "Atribuição".`)
           } else {
             toast.success(`Atribuído automaticamente para ${suggestions[0].name}`)
           }
        }
      }
    }
    loadSuggestedAssignee()
  }, [entidadeSelecionada])

  // --- Efeito de Persistência ---
  useEffect(() => {
    const cache = {
      numeroArp,
      emissor,
      valorTeto,
      tipoDoc,
      dataEmissao,
      prazoDias,
      entidadeSelecionada,
      uf,
      municipio,
      regiao,
      objetoAta,
      assignedTo,
      subcategoriaAta
    }
    localStorage.setItem('form_cache_dados_ata', JSON.stringify(cache))
    localStorage.setItem('form_cache_itens_ata', JSON.stringify(itensIA))
  }, [numeroArp, emissor, valorTeto, tipoDoc, dataEmissao, prazoDias, entidadeSelecionada, uf, municipio, regiao, itensIA, assignedTo, subcategoriaAta])

  function clearFormCache() {
    localStorage.removeItem('form_cache_dados_ata')
    localStorage.removeItem('form_cache_itens_ata')
    setNumeroArp('')
    setTipoDoc('ATA')
    setEmissor('')
    setValorTeto('')
    setDataEmissao('')
    setPrazoDias('0')
    setUf('')
    setMunicipio('')
    setRegiao('')
    setObjetoAta('')
    setSubcategoriaAta(null)
    setEntidadeSelecionada('')
    setAssignedTo('')
    setArquivo(null)
    setItensIA([])
    
    // Reseta o input de arquivo caso exista
    const fileInput = document.getElementById('file-upload') as HTMLInputElement
    if (fileInput) fileInput.value = ''
  }

  useEffect(() => {
    if (!canCreate) {
        toast.error('Você não tem permissão para acessar a importação.')
        navigate('/dashboard')
        return
    }
    loadInitialData()
  }, [canCreate])

  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsDragging(true)
      }
    }
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault()
    }
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
    }
    window.addEventListener('dragenter', handleWindowDragEnter)
    window.addEventListener('dragover', handleWindowDragOver)
    window.addEventListener('drop', handleWindowDrop)
    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter)
      window.removeEventListener('dragover', handleWindowDragOver)
      window.removeEventListener('drop', handleWindowDrop)
    }
  }, [])

  async function loadInitialData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const resEntidades = await fetchEntidades(user.id)
    if (resEntidades.data) setEntidades(resEntidades.data)

    // Buscar usuários para atribuição
    if (!isOP) {
      const { data: userData } = await supabase
        .from('profiles')
        .select('*')
        .neq('setor', 'VENDAS_PRIVADO')
        .order('display_name')
      if (userData) setUsers(userData)
    }
  }

  function toInputDate(raw: string | undefined | null): string {
    if (!raw) return ''
    const s = raw.trim()
    // Já está em YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    // DD/MM/YYYY ou DD-MM-YYYY (com ano de 2 ou 4 dígitos)
    const brMatch = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})$/)
    if (brMatch) {
      const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3]
      return `${year}-${brMatch[2]}-${brMatch[1]}`
    }
    // YYYY/MM/DD ou YYYY-MM-DD (cobre barra e hífen)
    const slashMatch = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/)
    if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`
    // Tenta via Date (fallback)
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    return ''
  }

  function findColumnValue(row: Record<string, any>, candidates: string[]): any {
    const keys = Object.keys(row)
    const normalizedKeys = keys.map(k => ({
      original: k,
      clean: k.toLowerCase().replace(/[^a-z0-9]/g, '')
    }))

    for (const candidate of candidates) {
      const target = candidate.toLowerCase().replace(/[^a-z0-9]/g, '')
      // 1. Tenta correspondência exata primeiro
      let matched = normalizedKeys.find(item => item.clean === target)
      // 2. Se não houver correspondência exata, tenta inclusão de termo
      if (!matched) {
        matched = normalizedKeys.find(item => item.clean.includes(target))
      }
      if (matched) {
        const val = row[matched.original]
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val
        }
      }
    }
    return null
  }

  function detectCategoriaFromDesc(d: string): string {
    const upper = (d || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    if (/MEDIC|COMPRIMIDO|CAPSULA|AMPOLA|INJETAVEL|INJ\.|FRASCO AMPOLA|FRASCO-AMPOLA|XAROPE|GOTAS|COLIRIO|POMADA|CREME|SUSPENSAO|SULFATO|CLORIDRATO|DICLOFENACO|IBUPROFENO|DIPIRONA|CETOPROFENO|AMOXICILINA|AZITROMICINA|OMEPRAZOL|INSULINA|SORO|GLICOSE|FISIOLOGICO|RINGER|BICARBONATO|ANTIBIOTICO|ANALGESICO|SACUBITRIL|XARELTO|TOPIRAMATO|PARACETAMOL|LOSARTANA|HIDROCLOROTIAZIDA|SIMVASTATINA|METFORMINA|ENALAPRIL|ATENOLOL|FLUOXETINA|CLONAZEPAM|DIAZEPAM|HALOPERIDOL|RISPERIDONA|QUETIAPINA|SERTRALINA|DEXAMETASONA|PREDNISONA|PREDNISOLONA|SALBUTAMOL|BUDESONIDA|IPRATROPIO|EPINEFRINA|NOREPINEFRINA|BUPIVACAINA|LIDOCAINA|ATROPINA|NEOSTIGMINA|FENTANIL|PROPOFOL|MIDAZOLAM|CETAMINA|SUXAMETONIO|PANTOPRAZOL|RANITIDINA|METOCLOPRAMIDA|ONDANSETRONA|CEFALEXINA|CEFTRIAXONA|CIPROFLOXACINO|METRONIDAZOL|ACICLOVIR|TENOFOVIR|OSELTAMIVIR|HEPARINA|VARFARINA|ENOXAPARINA|ACILINA|AMICINA|ATINA|OCORT|OLOL|OXINA|PRAZOL|PRIL|TADINA|VIR|TIPTINA|EPINA|PRIDA|ZINA|PAM/.test(upper)) {
      return 'MEDICAMENTO'
    }
    if (/DIETA|ENTERAL|FORMULA INFANTIL|NUTREN|PEPTAMEN|ENSURE|SUPLEMENTO ALIMENTAR|NUTRICAO/.test(upper)) {
      return 'DIETA'
    }
    if (/ODONTO|DENTAL|DENTARIO|ORTODON|PASTA DENTAL|BROCA DENTAL|CIMENTO DENTARIO|SUGADOR|ENDODON|EXTRATOR|ESPELHO CLINICO|ESPELHO BUCAL|LIMA ENDO|PINCA CLINICA/.test(upper)) {
      return 'ODONTO'
    }
    if (/CADEIRA|MESA |ARMARIO|ESTANTE|SOFA|BANCADA|PRATELEIRA|POLTRONA|MACA |LEITO |CAMA HOSPITALAR|MOBILIARIO|ARQUIVO DE ACO|ARQUIVO METAL|GUARDA-ROUPA/.test(upper)) {
      return 'MOBILIÁRIO'
    }
    if (/COMPUTADOR|MONITOR|IMPRESSORA|TECLADO|MOUSE |NOBREAK|TABLET|SWITCH|ROTEADOR|NOTEBOOK|PROJETOR|WEBCAM|HD EXTERNO|SCANNER|CABO DE REDE|RACK/.test(upper)) {
      return 'ELETRÔNICOS'
    }
    return 'MATERIAL HOSP'
  }

  async function processExcelAtaFile(file: File): Promise<{ itens: ItemTemp[], totalGlobal: number, totalSaldoDisponivel: number }> {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' })

    const itensResult: ItemTemp[] = []
    let totalGlobalSum = 0
    let totalSaldoDispSum = 0

    rawRows.forEach((row, idx) => {
      const desc = findColumnValue(row, ['produto', 'descricao', 'especificacao', 'nome', 'item'])
      if (!desc || String(desc).trim() === '') return

      const descStr = String(desc).trim()
      const descUpper = descStr.toUpperCase()

      // Ignorar linhas de totais, cabeçalhos repetidos ou resumos da planilha
      if (/^(TOTAL|SUBTOTAL|TOTAL GERAL|SALDO DISPONIVEL|SALDO TOTAL|RESUMO|TOTAL DA ATA|VALOR TOTAL|EMITIDO EM|PÁGINA|RELATÓRIO|SISTEMA)/.test(descUpper)) {
        return
      }

      const pos = findColumnValue(row, ['item', 'posicao', 'codigo', 'cod', 'ordem']) || String(idx + 1)
      const und = findColumnValue(row, ['un', 'und', 'unidade', 'medida']) || 'UN'

      // Busca Qtd Inicial e Qtd Disponivel
      const qtdInicialRaw = findColumnValue(row, ['qtdinicial', 'quantidadetotal', 'qtdtotal', 'quantidadeinicial', 'qtdregistrada'])
      const qtdSaldoRaw = findColumnValue(row, ['qtddisponivelsaldo', 'qtddisponivel', 'saldodisponivel', 'qtdsaldo', 'saldo', 'qtdremanescente'])
      const qtdCompradaRaw = findColumnValue(row, ['qtdcomprada', 'qtdconsumida', 'qtdentregue', 'qtdabatida'])
      const qtdGeralRaw = findColumnValue(row, ['quantidade', 'qtd'])

      const vUnitRaw = findColumnValue(row, [
        'vlrunit', 'valorunitario', 'precounitario', 'vlr unit', 'vunit', 'unitario'
      ])

      const vlrTotalRaw = findColumnValue(row, [
        'valortotal', 'vlrtotal', 'precototal', 'valortotalregistrado'
      ])
      const vlrTotalDispRaw = findColumnValue(row, [
        'vlrtotaldisp', 'valortotaldisp', 'totaldisp', 'valordisp'
      ])

      const marca = findColumnValue(row, ['marca', 'fabricante'])
      const forn = findColumnValue(row, ['fornecedor', 'empresa', 'vencedor'])

      const vUnit = parseBrazilianNumber(String(vUnitRaw || 0))
      
      let qtdInicial = parseBrazilianNumber(String(qtdInicialRaw || 0))
      let qtdSaldo = parseBrazilianNumber(String(qtdSaldoRaw || 0))
      let qtdComprada = parseBrazilianNumber(String(qtdCompradaRaw || 0))
      let qtdGeral = parseBrazilianNumber(String(qtdGeralRaw || 0))

      // Inteligência de Detecção de Qtd Inicial vs Saldo Disponível
      if (qtdInicial > 0 && qtdSaldo > 0) {
        if (qtdComprada === 0 && qtdInicial > qtdSaldo) {
          qtdComprada = Number((qtdInicial - qtdSaldo).toFixed(4))
        }
      } else if (qtdInicial > 0 && qtdComprada > 0 && qtdSaldo === 0) {
        qtdSaldo = Number((qtdInicial - qtdComprada).toFixed(4))
      } else if (qtdSaldo > 0 && qtdComprada > 0 && qtdInicial === 0) {
        qtdInicial = Number((qtdSaldo + qtdComprada).toFixed(4))
      } else if (qtdInicial === 0 && qtdSaldo === 0) {
        qtdInicial = qtdGeral
        qtdSaldo = qtdGeral
      } else if (qtdInicial > 0 && qtdSaldo === 0) {
        qtdSaldo = qtdInicial
      } else if (qtdSaldo > 0 && qtdInicial === 0) {
        qtdInicial = qtdSaldo
      }

      let totalInicial = 0
      if (vlrTotalRaw !== null && vlrTotalRaw !== undefined && String(vlrTotalRaw).trim() !== '') {
        totalInicial = parseBrazilianNumber(String(vlrTotalRaw))
      }
      if (!totalInicial || isNaN(totalInicial) || totalInicial === 0) {
        totalInicial = Number((qtdInicial * vUnit).toFixed(2))
      }

      let totalSaldo = 0
      if (vlrTotalDispRaw !== null && vlrTotalDispRaw !== undefined && String(vlrTotalDispRaw).trim() !== '') {
        totalSaldo = parseBrazilianNumber(String(vlrTotalDispRaw))
      }
      if (!totalSaldo || isNaN(totalSaldo) || totalSaldo === 0) {
        totalSaldo = Number((qtdSaldo * vUnit).toFixed(2))
      }

      totalGlobalSum += totalInicial
      totalSaldoDispSum += totalSaldo

      itensResult.push({
        posicao: String(pos),
        descricao: descStr,
        quantidade: qtdInicial,
        quantidade_inicial: qtdInicial,
        quantidade_abatida: qtdComprada,
        saldo_disponivel: qtdSaldo,
        unidade: String(und).toUpperCase().trim(),
        valor_unitario: vUnit,
        valor_total: totalInicial,
        valor_total_disponivel: totalSaldo,
        marca: marca ? String(marca).trim() : undefined,
        categoria: detectCategoriaFromDesc(descStr),
        fornecedor: forn ? String(forn).trim() : 'ROSAFARM (Consolidado)'
      })
    })

    const itensComSubcat = await autoDeduceSubcategories(itensResult)

    return { itens: itensComSubcat, totalGlobal: totalGlobalSum, totalSaldoDisponivel: totalSaldoDispSum }
  }

async function renderPdfPagesToJpegs(pdf: any, startPage: number, endPage: number, scale = 1.5): Promise<string[]> {
  const images: string[] = []
  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) continue
      canvas.height = viewport.height
      canvas.width = viewport.width

      await page.render({ canvasContext: context, viewport }).promise
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      images.push(base64)
    } catch (err) {
      console.warn(`[PDF Render] Falha ao renderizar página ${pageNum}:`, err)
    }
  }
  return images
}

  async function handleArquivoIA(e: React.ChangeEvent<HTMLInputElement>) {
     if (!e.target.files?.length) return
     const file = e.target.files[0]
     const isExcel = /\.xlsx?$/i.test(file.name) || /\.csv$/i.test(file.name)

     setLoadingIA(true)
     setProgress(10)
     
     try {
        if (isExcel) {
          setStatusLog('📊 Lendo planilha Excel/CSV instantaneamente...')
          setProgress(50)
          const { itens, totalGlobal, totalSaldoDisponivel } = await processExcelAtaFile(file)
          
          if (itens.length === 0) {
            toast.error('Nenhum item válido foi encontrado na planilha. Verifique se o arquivo possui colunas com PRODUTO, QTD e VALOR UNITÁRIO.')
            return
          }

          setItensIA(itens)
          setValorTeto(totalGlobal.toFixed(2))
          setValorTotalSaldoDisponivel(totalSaldoDisponivel)
          setArquivo(file)
          setProgress(100)
          
          if (totalSaldoDisponivel > 0 && Math.abs(totalGlobal - totalSaldoDisponivel) > 1) {
            toast.success(`Planilha Excel importada! Teto Registrado: R$ ${totalGlobal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Saldo Livre Atual: R$ ${totalSaldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
          } else {
            toast.success(`Planilha Excel importada com sucesso! ${itens.length} itens carregados instantaneamente.`)
          }
          return
        }

        setStatusLog('📄 Lendo e preparando o documento PDF...')
        const arrayBuffer = await file.arrayBuffer()
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        const pdf = await loadingTask.promise
        const totalPages = pdf.numPages
        
        let rawAccumulatedItens: any[] = []
        let docInfo: any = null

        const allPageTexts: string[] = []
        setStatusLog('📄 Lendo e preparando o documento PDF...')
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()
            const pageText = extractPageText(textContent, i)
            allPageTexts.push(pageText)
        }

        let globalContext = ''
        const contextPages = Math.min(2, totalPages)
        for (let i = 1; i <= contextPages; i++) {
            globalContext += `\n--- Pág ${i} ---\n` + allPageTexts[i - 1]
        }

        if (totalPages > contextPages) {
            const lastPageStart = Math.max(totalPages - 1, contextPages + 1)
            for (let i = lastPageStart; i <= totalPages; i++) {
                globalContext += `\n--- FINAL DO DOC (Pág ${i}) ---\n` + allPageTexts[i - 1]
            }
        }

        // Mapeia o fornecedor ativo para cada página (1-based)
        const pageActiveSupplier: { [pageNum: number]: { nome: string; cnpj: string } | null } = {}
        let currentActiveSupplier: { nome: string; cnpj: string } | null = null
        const CNPJ_REGEX = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/

        for (let pNum = 1; pNum <= totalPages; pNum++) {
            const text = allPageTexts[pNum - 1]
            const lines = text.split('\n')
            
            for (const line of lines) {
                const lineUpper = line.toUpperCase()
                const cnpjMatch = line.match(CNPJ_REGEX)
                
                if (cnpjMatch && (lineUpper.includes('LTDA') || lineUpper.includes('S.A') || lineUpper.includes('S/A') || lineUpper.includes('DISTRIBUIDORA') || lineUpper.includes('COMERCIO') || lineUpper.includes('COMÉRCIO') || lineUpper.includes('PRODUTOS') || lineUpper.includes('IMPORTADORA') || lineUpper.includes('EMPRESA') || lineUpper.includes('PARTICIPANTE') || lineUpper.includes('VENCEDOR'))) {
                    const rawCnpj = cnpjMatch[1]
                    const cleanCnpj = rawCnpj.replace(/\D/g, '')
                    
                    let namePart = lineUpper.split(rawCnpj)[0].trim()
                    if (!namePart) {
                        namePart = lineUpper.split('|')[0].trim()
                    }
                    namePart = namePart.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '').trim()
                    
                    if (namePart && namePart.length > 5 && !namePart.includes('PREFEITURA') && !namePart.includes('MUNICÍPIO') && !namePart.includes('CONSORCIO') && !namePart.includes('ESTADO')) {
                        currentActiveSupplier = {
                            nome: namePart,
                            cnpj: cleanCnpj
                        }
                        console.log(`[Supplier Map] Fornecedor detectado na pág ${pNum}: "${namePart}" (CNPJ: ${cleanCnpj})`)
                        break
                    }
                }
            }
            pageActiveSupplier[pNum] = currentActiveSupplier
        }

        const promptHeader = `Analise o texto desta Ata de Registro de Preços (ou Contrato/Adesão) e extraia os dados solicitados.

DADOS DA EMPRESA ALVO (FORNECEDOR):
- Razão Social: ROSAFARM ou NEXUS
- CNPJ: 00.000.000/0001-99 (Rosafarm) ou 00.000.000/0001-96 (NEXUS)

REGRAS DE EXTRAÇÃO:
1. Extraia os valores financeiros EXATAMENTE como aparecem no texto (ex: "1.500,00" ou "1.500.000,00"). Retorne como STRING. NÃO tente converter para número ou padrão americano.
2. Para "numero_arp", extraia como estiver no documento (ex: "018/2025", "18.2025", "04/25").
3. Para "valor_total_empresa_alvo", procure pelo valor adjudicado especificamente para a Empresa Alvo. Se ela for a única fornecedora da Ata, este valor será igual ao "valor_total_ata".
4. Para "unico_fornecedor", defina como true se a Empresa Alvo (ROSAFARM ou NEXUS) for a única fornecedora/vencedora de todo o documento (ou se não houver menção a nenhum outro fornecedor concorrente no cabeçalho ou texto fornecido). Caso contrário, se houver outros fornecedores vencedores listados, defina como false.

OUTRAS REGRAS DE EXTRAÇÃO E SEGURANÇA GEOGRÁFICA (MUITO CRÍTICO):
- REGRA GEOGRÁFICA DE EVITAR FORNECEDOR NO COMPRADOR: O documento contém informações da empresa fornecedora/vencedora (como ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA ou NEXUS) que está sediada em Inhumas/GO ou Palmas/TO. JAMAIS utilize o município (Inhumas), o estado/uf (GO), o CEP (75400-000, 75402-000 ou similares) ou o CNPJ do fornecedor (00.000.000/0001-99 ou 00.000.000/0001-96) como dados de localização do órgão emissor/comprador (orgao_emissor).
- O orgao_emissor deve conter apenas os dados cadastrais do órgão comprador (Prefeitura, Consórcio, Secretaria, etc.), e sua localização (município/uf) deve ser a da prefeitura ou consórcio público (ex: se for da Prefeitura de Rio Maria, o município é "Rio Maria" e a UF é "PA").
- data_emissao (data de assinatura ou publicação, procure especialmente no final do documento, formato YYYY-MM-DD)
- orgao_emissor: {
    "nome": "string",
    "cnpj": "string (APENAS NÚMEROS)",
    "municipio": "string (APENAS O NOME DA CIDADE COMPRADORA, SEM ESTADO OU CEP)",
    "uf": "string (Sigla, ex: TO)",
    "regiao": "string"
  }
- objeto_ata: classifique o objeto desta licitação em UMA das seguintes categorias:
  "Medicamento" | "Material Hospitalar" | "Odonto" | "Mobiliário" | "Eletrônico" | "Misto"

IMPORTANTE: No campo 'municipio', coloque APENAS o nome da cidade compradora/órgão emissor.

TEXTO:
${globalContext}

JSON esperado: { 
  "numero_arp": string, 
  "valor_total_ata": string,
  "valor_total_empresa_alvo": string,
  "data_emissao": string, 
  "orgao_emissor": { "nome": string, "cnpj": string, "municipio": string, "uf": string, "regiao": string }, 
  "objeto_ata": string,
  "unico_fornecedor": boolean
}`
        
        setStatusLog('🔍 Extraindo cabeçalho e dados gerais da Ata...')
        setProgress(15)
        const headerSchema = {
          type: "OBJECT",
          properties: {
            numero_arp: { type: "STRING" },
            valor_total_ata: { type: "STRING" },
            valor_total_empresa_alvo: { type: "STRING" },
            data_emissao: { type: "STRING" },
            orgao_emissor: {
              type: "OBJECT",
              properties: {
                nome: { type: "STRING" },
                cnpj: { type: "STRING" },
                municipio: { type: "STRING" },
                uf: { type: "STRING" },
                regiao: { type: "STRING" }
              },
              required: ["nome"]
            },
            objeto_ata: { type: "STRING" },
            unico_fornecedor: { type: "BOOLEAN" }
          },
          required: ["numero_arp"]
        }
        const isScaneado = globalContext.replace(/--- Pág \d+ ---/g, '').replace(/--- FINAL DO DOC \(Pág \d+\) ---/g, '').trim().length < 100;
        if (isScaneado) {
            console.warn('[PDF.js] PDF escaneado detectado (via CriarAta). Ativando renderização de imagens paginadas ultra-leves.');
        }

        const headerImages = isScaneado ? await renderPdfPagesToJpegs(pdf, 1, Math.min(2, totalPages)) : undefined
        // Otimização de Tokens: para extração do cabeçalho, enviamos apenas as primeiras 3 páginas do texto
        const headerTextContext = isScaneado ? "" : globalContext.split(/--- Pág \d+ ---/).slice(0, 4).join('\n')
        const headerData = await analyzeWithAI(file, headerTextContext, promptHeader, headerSchema, "flash", headerImages)
        // Captura o valor do cabeçalho em var local (não reativa) — apenas para log informativo.
        // O valor definitivo do state será sempre a soma real dos itens extraídos.
        let valorTetoHeaderLocal = 0;
        if (headerData?.valor_total_empresa_alvo || headerData?.valor_total_ata) {
            valorTetoHeaderLocal = parseBrazilianNumber(headerData.valor_total_empresa_alvo || headerData.valor_total_ata)
            setValorTeto(String(valorTetoHeaderLocal))
        }
        if (headerData) {
            setNumeroArp(headerData.numero_arp || '')
            setDataEmissao(toInputDate(headerData.data_emissao))
            setEmissor(headerData.orgao_emissor?.nome || '')
            const rawEstado = headerData.orgao_emissor?.uf || headerData.orgao_emissor?.estado || ''
            const normalizedEstado = normalizeState(rawEstado)
            setUf(normalizedEstado)
            let extMunicipio = sanitizeMunicipality(headerData.orgao_emissor?.municipio || '')
            if (extMunicipio && extMunicipio.toLowerCase().includes('inhumas')) {
                console.warn('[AI/Geográfico] Ignorando município Inhumas detectado na Ata.');
                extMunicipio = '';
            }
            setMunicipio(extMunicipio)
            setRegiao(getStateRegion(normalizedEstado))
            setCnpj(headerData.orgao_emissor?.cnpj || '')
            setPrazoDias('365') 
            if (headerData.objeto_ata) setObjetoAta(headerData.objeto_ata)
        }

        // Para ATAs de fornecedor único, o header da tabela de itens só aparece na 1ª página.
        // Injetamos o nome do fornecedor no contexto para que a IA saiba, em todos os chunks,
        // que todos os itens pertencem à nossa empresa.
        const unicoFornecedor = headerData?.unico_fornecedor ?? false;
        // Detecta qual das nossas empresas é a fornecedora pelo contexto do globalContext
        const globalCtxUpper = globalContext.toUpperCase();
        const empresaAlvoNome = globalCtxUpper.includes('NEXUS') || globalCtxUpper.includes('13.973.552') || globalCtxUpper.includes('13973552')
            ? 'NEXUS'
            : 'ROSAFARM';

        const minifiedContext = JSON.stringify({
            contexto: {
                orgao: headerData?.orgao_emissor?.nome || emissor || '',
                arp: headerData?.numero_arp || numeroArp || '',
                empresa_alvo_cnpjs: ["37676047000180", "13973552000128"],
                unico_fornecedor: unicoFornecedor,
                empresa_alvo_nome: empresaAlvoNome || 'ROSAFARM ou NEXUS',
                instrucao_fornecedor: unicoFornecedor
                    ? `ATENÇÃO: Este é um documento de fornecedor único. TODOS os itens desta ATA pertencem exclusivamente à empresa ${empresaAlvoNome || 'ROSAFARM/NEXUS'}. Defina vencidoPorEmpresaAlvo=true para TODOS os itens, independente do que aparecer nas páginas.`
                    : 'Identifique o fornecedor de cada item e marque vencidoPorEmpresaAlvo conforme apropriado.'
            }
        });

        const CHUNK_SIZE = isScaneado ? 2 : 5
        const OVERLAP = isScaneado ? 0 : 1
        
        const blocos: { startPage: number; endPage: number }[] = []
        for (let startPage = 1; startPage <= totalPages; ) {
            const endPage = Math.min(startPage + CHUNK_SIZE - 1, totalPages)
            blocos.push({ startPage, endPage })
            if (endPage === totalPages) break
            startPage = endPage - OVERLAP + 1
            if (startPage <= 1) startPage = endPage + 1
        }
        
        const totalBlocos = blocos.length
        
        const promptPart = `Você é um extrator de dados de altíssima precisão especialista em ATAS de Registro de Preços.

DADOS DA EMPRESA ALVO:
- Nomes: ROSAFARM ou NEXUS (CNPJs: 00.000.000/0001-99 e 00.000.000/0001-96).

MISSÃO PRINCIPAL:
Extrair TODOS os itens da tabela de itens contidos no bloco de páginas fornecido — incluindo itens de QUALQUER fornecedor (nossos e concorrentes). NÃO OMITA nenhum item. O sistema fará a filtragem posterior. Seu trabalho é extrair fielmente e classificar.

REGRAS CRÍTICAS:
1. RETORNE TODOS OS ITENS: Extraia absolutamente todos os itens encontrados nas páginas, de todos os fornecedores. Para cada item, defina vencidoPorEmpresaAlvo=true se for da ROSAFARM ou NEXUS, e false para todos os outros fornecedores. NUNCA omita um item apenas por não ser da empresa alvo.
2. HERANÇA E IDENTIFICAÇÃO DE FORNECEDOR: O nome do fornecedor vencedor geralmente aparece em um cabeçalho destacado acima da tabela de itens (ex: "ROSAFARM DISTRIBUIDORA...", "D M HOSPITALAR LTDA"). Todos os itens abaixo desse cabeçalho pertencem a esse fornecedor até que outro cabeçalho de fornecedor apareça. Uma tabela pode se estender por várias páginas sem repetir o nome do fornecedor; nesse caso, herde o fornecedor do cabeçalho anterior.
3. CUIDADO COM QUANTIDADES vs VALORES E UNIDADES COM NÚMEROS: A quantidade real do item vem exclusivamente da coluna 'Quantidade'. JAMAIS extraia números de dentro da coluna 'Unidade/Apresentação' (ex: 'CX 25 UN' ou 'CX 100 UN') como a quantidade comprada. Use a lógica: quantidade × valor_unitario = valor_total para validar.
4. VALOR UNITÁRIO: Extraia o preço unitário como "Lance", "Valor Unit." ou equivalente. Ex: "5,32", "17,99".
5. PAGINAORIGINAL: Extraia do marcador [PG:X] e retorne apenas o número X. Se for PDF escaneado sem marcadores, deixe vazio.
6. SUPORTE A MÚLTIPLOS FORMATOS: As atas podem vir em formato de "blocos/fichas" (LOTE X, Item Y) OU tabela tradicional com colunas (Item | Código | Descrição | Qtd | Valor). Leia o formato e extraia corretamente.
7. MODO VISÃO (PDF ESCANEADO): Se o TEXTO DO BLOCO contiver apenas marcadores de página sem texto real, significa PDF escaneado. Extraia os itens VISUALMENTE do arquivo PDF fornecido. Leia as páginas indicadas no contexto.
8. MARCA vs FORNECEDOR (MUITO CRÍTICO): A coluna "Marca ou fabricante", "Marca" ou "Fabricante" contém a marca/fabricante do produto (ex: "MEDIX", "BIOSANI", "WELL LEAD", "CRAL PLAST"). JAMAIS extraia a marca/fabricante da linha como sendo o "fornecedor" do item. O "fornecedor" é a empresa que venceu o lote (ex: ROSAFARM), indicada no cabeçalho acima da tabela, e não a marca do produto.
9. FORNECEDOR ATIVO DO BLOCO: No contexto do bloco, você receberá a linha "FORNECEDOR ATIVO PARA ESTAS PÁGINAS". Se este campo estiver preenchido com um fornecedor conhecido (ex: ROSAFARM) e não houver nenhuma outra coluna de fornecedores concorrentes explícitos na tabela, todos os itens dessas páginas pertencem a este fornecedor ativo. Use a coluna "Marca ou fabricante" estritamente como marca, e nunca como fornecedor.
10. IGNORE CABEÇALHOS DE EMPRESA: Tabelas de identificação da empresa (EMPRESA, CNPJ, ENDEREÇO) não são itens. A tabela de itens contém produtos com Código, Descrição, Quantidade e Valor.

MAPEAMENTO DE DADOS:
- "numero": Número do item/lote.
- "descricao": Descrição completa do produto.
- "quantidade": Quantidade real (número inteiro).
- "unidade": Unidade de medida (PCT, CX, UN, etc.).
- "valor_unitario": Preço unitário homologado.
- "marca": Marca do produto.
- "valor_total": Valor total do item.
- "fornecedor": Nome completo da empresa vencedora do item.
- "vencidoPorEmpresaAlvo": true se ROSAFARM ou NEXUS, false caso contrário.
- "paginaOriginal": Número da página de origem.

TEXTO DO BLOCO:
{bloco_texto}

JSON esperado:
{
  "itens": [
    {
      "numero": number,
      "descricao": string,
      "quantidade": string,
      "unidade": string,
      "valor_unitario": string,
      "marca": string,
      "valor_total": string,
      "fornecedor": string,
      "vencidoPorEmpresaAlvo": boolean,
      "paginaOriginal": string
    }
  ]
}`;

        const partSchema = {
          type: "OBJECT",
          properties: {
            itens: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  numero: { type: "INTEGER" },
                  descricao: { type: "STRING" },
                  quantidade: { type: "STRING" },
                  unidade: { type: "STRING" },
                  valor_unitario: { type: "STRING" },
                  marca: { type: "STRING" },
                  valor_total: { type: "STRING" },
                  fornecedor: { type: "STRING" },
                  vencidoPorEmpresaAlvo: { type: "BOOLEAN" },
                  paginaOriginal: { type: "STRING" }
                },
                required: [
                  "numero", "descricao", "quantidade", "valor_unitario", "vencidoPorEmpresaAlvo"
                ]
              }
            }
          },
          required: ["itens"]
        }

        // PDFs escaneados enviam o arquivo completo (Base64) em cada chunk.
        // Mais de 1 requisição simultânea causa crash da Edge Function (status 520 / CORS missing).
        // PDFs com texto podem usar concorrência maior sem problema.
        const CONCURRENCY = isScaneado ? 1 : 3
        let blocoContador = 0

        for (let i = 0; i < blocos.length; i += CONCURRENCY) {
            const batch = blocos.slice(i, i + CONCURRENCY)
            const progressStart = 15 + Math.round((i / totalBlocos) * 75)
            
            setStatusLog(`🧠 Processando lote de blocos ${Math.floor(i / CONCURRENCY) + 1}...`)
            setProgress(progressStart)

            const batchPromises = batch.map(async (bloco) => {
                const { startPage, endPage } = bloco
                let chunkText = ''
                
                for (let pNum = startPage; pNum <= endPage; pNum++) {
                    chunkText += `\n--- Pág ${pNum} ---\n${allPageTexts[pNum - 1]}`
                }

                const activeSupplier = pageActiveSupplier[startPage]
                const supplierHeaderContext = activeSupplier
                    ? `FORNECEDOR ATIVO PARA ESTAS PÁGINAS (CABEÇALHO DA ATA): ${activeSupplier.nome} (CNPJ: ${activeSupplier.cnpj})`
                    : 'FORNECEDOR ATIVO PARA ESTAS PÁGINAS: Não identificado explicitamente no início deste bloco.'

                const chunkWithContext = `CONTEXTO DA ATA (CABEÇALHO):\n${minifiedContext}\n${supplierHeaderContext}\n\n--- INÍCIO DO BLOCO DE ITENS (Páginas ${startPage} a ${endPage}) ---\n${chunkText}`
                
                // Correção crucial para PDFs Escaneados: Não envia o bloco de texto vazio para não confundir a IA!
                const blocoPromptInjection = isScaneado
                    ? `CONTEXTO DA ATA (CABEÇALHO):\n${minifiedContext}\n${supplierHeaderContext}\n\nO PDF original em imagem/anexo contém as páginas ${startPage} a ${endPage}. Por favor, processe VISUALMENTE este arquivo.`
                    : `TEXTO DO BLOCO:\n${chunkWithContext}`

                const promptComTexto = promptPart.replace('{bloco_texto}', blocoPromptInjection)

                const chunkImages = isScaneado ? await renderPdfPagesToJpegs(pdf, startPage, endPage) : undefined
                let dadosPart = await analyzeWithAI(file, chunkWithContext, promptComTexto, partSchema, "flash", chunkImages)

                if (dadosPart && dadosPart.is_partial === true) {
                    console.warn(`[AI Chunk] Bloco grande detectado (parcial). Reprocessando págs ${startPage}–${endPage} individualmente...`)
                    const subItens: any[] = []
                    
                    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
                        console.log(`[AI Chunk Retry] Processando página individual ${pageNum}...`)
                        const subChunkText = `\n--- Pág ${pageNum} ---\n${allPageTexts[pageNum - 1]}`
                        
                        const subActiveSupplier = pageActiveSupplier[pageNum]
                        const subSupplierHeaderContext = subActiveSupplier
                            ? `FORNECEDOR ATIVO PARA ESTAS PÁGINAS (CABEÇALHO DA ATA): ${subActiveSupplier.nome} (CNPJ: ${subActiveSupplier.cnpj})`
                            : 'FORNECEDOR ATIVO PARA ESTAS PÁGINAS: Não identificado explicitamente no início deste bloco.'

                        const subChunkWithContext = `CONTEXTO DA ATA (CABEÇALHO):\n${minifiedContext}\n${subSupplierHeaderContext}\n\n--- INÍCIO DO BLOCO DE ITENS (Página ${pageNum}) ---\n${subChunkText}`
                        
                        const subBlocoPromptInjection = isScaneado
                            ? `CONTEXTO DA ATA (CABEÇALHO):\n${minifiedContext}\n${subSupplierHeaderContext}\n\nO PDF original em imagem/anexo contém a página ${pageNum}. Por favor, processe VISUALMENTE este arquivo.`
                            : `TEXTO DO BLOCO:\n${subChunkWithContext}`

                        const subPromptComTexto = promptPart.replace('{bloco_texto}', subBlocoPromptInjection)

                        try {
                            const subImages = isScaneado ? await renderPdfPagesToJpegs(pdf, pageNum, pageNum) : undefined
                            const subDadosPart = await analyzeWithAI(file, subChunkWithContext, subPromptComTexto, partSchema, "flash", subImages)
                            if (subDadosPart && subDadosPart.itens) {
                                subItens.push(...subDadosPart.itens)
                            }
                        } catch (subErr) {
                            console.error(`Erro ao reprocessar página ${pageNum}:`, subErr)
                        }
                    }
                    dadosPart = {
                        ...dadosPart,
                        itens: subItens,
                        is_partial: false
                    }
                }
                return { bloco, dadosPart }
            })

            const batchResults = await Promise.all(batchPromises)

            // Acumula os itens processando-os em ordem determinística
            for (const res of batchResults) {
                const { bloco, dadosPart } = res
                blocoContador++
                
                if (dadosPart && dadosPart.itens) {
                    if (!docInfo) docInfo = dadosPart
                    
                    const partItens = dadosPart.itens.map((it: any, indexNoBloco: number) => {
                        const extrairApenasNumero = (rawStr: string) => {
                            if (!rawStr) return "0";
                            const match = String(rawStr).match(/[\d.,]+/);
                            return match ? match[0] : "0";
                        };

                        const qtdLimpa = extrairApenasNumero(it.quantidade || it.quantidade_total);
                        const unitLimpo = extrairApenasNumero(it.valor_unitario || it.lance);
                        const totalLimpo = extrairApenasNumero(it.valor_total);

                        const rawQtd = parseBrazilianNumber(qtdLimpa);
                        const rawUnit = parseBrazilianNumber(unitLimpo);
                        const rawTotal = parseBrazilianNumber(totalLimpo);
                        
                        // Triangulação e Cura Matemática Auto-Regenerativa (Self-Healing)
                        let qtd = rawQtd;
                        let unit = rawUnit;
                        let total = rawTotal;

                        if (rawQtd > 0 && rawUnit > 0) {
                            const calcTotal = rawQtd * rawUnit;
                            // Se a diferença entre o total calculado e o lido for superior a R$ 0.10, há inconsistência
                            if (rawTotal > 0 && Math.abs(calcTotal - rawTotal) > 0.10) {
                                // Testamos curar a quantidade (a IA pode ter confundido quantidade com o valor total/referência do lote)
                                const healedQtd = rawTotal / rawUnit;
                                const isCleanInteger = Math.abs(healedQtd - Math.round(healedQtd)) < 0.05;
                                if (isCleanInteger && Math.round(healedQtd) > 0) {
                                    qtd = Math.round(healedQtd);
                                    total = Number((qtd * unit).toFixed(2));
                                    console.log(`[Self-Healing] Item #${it.numero} (pág ${it.paginaOriginal}): quantidade corrigida de ${rawQtd} para ${qtd} usando triangulação (Total: ${rawTotal} / Unit: ${rawUnit})`);
                                } else {
                                    // Se a quantidade lida parecer um inteiro razoável e o total lido estiver bizarro, curamos o total
                                    total = Number((qtd * unit).toFixed(2));
                                    console.log(`[Self-Healing] Item #${it.numero} (pág ${it.paginaOriginal}): total corrigido de ${rawTotal} para ${total} usando Qtd * Unit (${qtd} * ${unit})`);
                                }
                            } else if (rawTotal === 0 || isNaN(rawTotal)) {
                                // Se não havia total lido, calcula
                                total = Number((qtd * unit).toFixed(2));
                            } else {
                                // Se batia ou a diferença era ínfima, usamos o calculado exato para evitar dízimas
                                total = Number(calcTotal.toFixed(2));
                            }
                        }

                        // Garante que quantidade é um inteiro razoável se não houver dízima intencional
                        if (qtd > 0 && Math.abs(qtd - Math.round(qtd)) < 0.01) {
                            qtd = Math.round(qtd);
                        }

                        const rawPg = String(it.paginaOriginal || '').replace(/\D/g, '');
                        const pgNum = rawPg ? Number(rawPg) : bloco.startPage;

                        return {
                            numero: it.numero,
                            descricao: it.descricao || '',
                            quantidade: qtd,
                            unidade: it.unidade || '',
                            valor_unitario: unit,
                            valor_total: total,
                            marca: it.marca || '',
                            lote: it.lote || null,
                            codigo: it.codigo_item || it.codigo || null,
                            categoria: detectCategoriaFromDesc(it.descricao || ''),
                            codigo_mapeamento_ia: it.codigo_mapeamento_ia || null,
                            fornecedor: it.fornecedor || '',
                            vencidoPorEmpresaAlvo: it.vencidoPorEmpresaAlvo,
                            paginaOriginal: pgNum,
                            indexFisico: indexNoBloco
                        }
                    }).filter(isValidItemAta)
                    
                    const generarChaveRobusta = (item: any) => {
                        const numItem = String(item.numero || '').trim()
                        const qtdKey = Number(item.quantidade || 0).toFixed(4)
                        const unitKey = Number(item.valor_unitario || 0).toFixed(4)
                        
                        if (numItem) {
                            // O número do lote é único no documento inteiro.
                            // NÃO incluir a página para evitar duplicatas do overlap de chunks
                            // (ex: LOTE 256 cujo cabeçalho está na pág 6 e a descrição na pág 7).
                            return `LOTE-${numItem}-UNIT-${unitKey}`
                        } else {
                            const pg = String(item.paginaOriginal || '0')
                            return `PG-${pg}-PHYS-${item.indexFisico}-QTD-${qtdKey}-UNIT-${unitKey}`
                        }
                    }

                    const partItensDeduplicados = partItens.filter((novoItem: any) => {
                        const chaveNovo = generarChaveRobusta(novoItem)
                        const existenteIdx = rawAccumulatedItens.findIndex((itemExistente: any) => generarChaveRobusta(itemExistente) === chaveNovo)
                        
                        if (existenteIdx === -1) return true // item novo, inclui

                        // Duplicata detectada: mantém o item com a descrição mais longa (completa)
                        const existente = rawAccumulatedItens[existenteIdx]
                        const descNova = (novoItem.descricao || '').trim()
                        const descExistente = (existente.descricao || '').trim()
                        if (descNova.length > descExistente.length) {
                            console.log(`[Dedup] Lote ${novoItem.numero}: substituindo descrição curta "${descExistente.slice(0, 30)}" pela completa "${descNova.slice(0, 50)}"`)
                            rawAccumulatedItens[existenteIdx] = { ...existente, descricao: descNova }
                        }
                        return false // descarta o duplicado
                    })

                    rawAccumulatedItens = [...rawAccumulatedItens, ...partItensDeduplicados]
                    console.log(`[AI Chunk] Bloco ${blocoContador} processado. Itens do bloco: ${partItensDeduplicados.length}. Total acumulado: ${rawAccumulatedItens.length}`)
                }
            }
        }

        if (docInfo || rawAccumulatedItens.length > 0) {
            // =================================================================
            // MÁQUINA DE ESTADOS DETERMINÍSTICA DE TITULARIDADE NO FRONTEND
            // =================================================================
            const NOSSOS_IDENTIFICADORES = ['ROSAFARM', 'NEXUS', '37676047', '37.676.047', '13973552', '13.973.552']
            
            let isNossaEmpresaAtiva = false; // Começa como false para não aceitar fornecedores anteriores à nossa empresa
            let encontrouTotalVencedor = false;

            // Ordena os itens textualmente por página e index físico para garantir fluxo contínuo
            const itensOrdenadosFisicos = [...rawAccumulatedItens].sort((a, b) => {
                if (a.paginaOriginal !== b.paginaOriginal) return a.paginaOriginal - b.paginaOriginal;
                return a.indexFisico - b.indexFisico;
            });

            const itensFiltradosFinais = itensOrdenadosFisicos.filter((it) => {
                const fornOriginal = String(it.fornecedor || '').toUpperCase().trim()
                const descOriginal = String(it.descricao || '').toUpperCase().trim()

                if (encontrouTotalVencedor) {
                    return false;
                }

                if (
                    fornOriginal.includes('TOTAL DO VENCEDOR') ||
                    fornOriginal.includes('TOTAL HOMOLOGADO') ||
                    fornOriginal.includes('DEMONSTRATIVO DE LOTES') ||
                    fornOriginal.includes('RELATÓRIO DE PROPOSTAS') ||
                    descOriginal.includes('TOTAL DO VENCEDOR') ||
                    descOriginal.includes('TOTAL HOMOLOGADO') ||
                    descOriginal.includes('DEMONSTRATIVO DE LOTES')
                ) {
                    console.log(`[Filtro] Marcador de encerramento da Ata/Vencedor detectado ("${fornOriginal || descOriginal}") na pág ${it.paginaOriginal}. Encerrando captura.`);
                    encontrouTotalVencedor = true;
                    isNossaEmpresaAtiva = false;
                    return false;
                }

                const fornLimpo = fornOriginal.replace(/[^A-Z0-9]/g, '')
                const contemNossosDados = NOSSOS_IDENTIFICADORES.some(id => 
                    fornLimpo.includes(id.replace(/\D/g, '') || id) || fornOriginal.includes(id)
                )

                // Evitamos falsos positivos com termos institucionais/genéricos do documento (sem hífens soltos)
                const termosGenericos = ['PREFEITURA', 'CONSÓRCIO', 'CONSORCIO', 'ESTADO', 'MUNICÍPIO', 'MUNICIPIO', 'SECRETARIA', 'ÓRGÃO', 'ORGAO', 'ADJUDICADO', 'VALOR DA ATA', 'DEMONSTRATIVO DE LOTES']
                const eTermoGenerico = termosGenericos.some(term => fornOriginal.includes(term))

                const achouConcorrente = fornOriginal !== '' && !contemNossosDados && !eTermoGenerico;

                if (achouConcorrente) {
                    console.warn(`[Filtro] Concorrente detectado: "${fornOriginal}" → desligando herança`);
                    isNossaEmpresaAtiva = false;
                }
                
                // Sinal de RE-LIGAÇÃO: encontrou nossos dados explícitos ou IA marcou como vencido por nós
                if (contemNossosDados || it.vencidoPorEmpresaAlvo === true) {
                    if (!isNossaEmpresaAtiva) {
                        console.log(`[Filtro] Re-ligação: "${fornOriginal}" é nosso → ativando herança`);
                    }
                    isNossaEmpresaAtiva = true;
                }

                // Herança Contextual: se ativo, normaliza o nome e inclui o item
                if (isNossaEmpresaAtiva) {
                    const fornUpper = fornOriginal.toUpperCase();
                    if (fornUpper.includes('NEXUS') || fornUpper.includes('13973552') || fornUpper.includes('13.973.552')) {
                        it.fornecedor = 'NEXUS (Consolidado)';
                    } else {
                        it.fornecedor = 'ROSAFARM (Consolidado)';
                    }
                } else {
                    console.log(`[Filtro] Item DESCARTADO (pág ${it.paginaOriginal}): "${it.descricao?.slice(0, 50)}" | Forn: "${fornOriginal}"`);
                }
                return isNossaEmpresaAtiva;
            });

            console.log(`[Filtro] Máquina de estados rodou. Itens originais: ${rawAccumulatedItens.length}, Itens da empresa alvo: ${itensFiltradosFinais.length}`);

            setStatusLog('Cruzando itens com o catálogo de produtos...')
            setProgress(92)
            
            const linkedItens = await linkItemsToCatalog(itensFiltradosFinais)
            const itensUnificados: ItemTemp[] = []
            
            linkedItens.forEach((item, indexOriginal) => {
                const vUnitNormalized = Number(item.valor_unitario || 0)
                const catId = item.produto_catalogo_id
                const descNormalized = (item.descricao || '').trim().toLowerCase()
                
                const existente = itensUnificados.find(u => {
                    const mesmoValor = Math.abs(Number(u.valor_unitario || 0) - vUnitNormalized) < 0.005
                    if (!mesmoValor) return false
                    
                    if (catId && u.produto_catalogo_id) {
                        return catId === u.produto_catalogo_id
                    } else {
                        return u.descricao.trim().toLowerCase() === descNormalized
                    }
                })

                if (existente) {
                    const qtdAtual = Number(existente.quantidade || 0)
                    const qtdNova = Number(item.quantidade || 0)
                    const totalAtual = Number(existente.valor_total || 0)
                    const totalNovo = Number(item.valor_total || 0)

                    existente.quantidade = Number((qtdAtual + qtdNova).toFixed(4))
                    existente.valor_total = Number((totalAtual + totalNovo).toFixed(2))
                    
                    if (!existente.descricao.includes('[UNIFICADO')) {
                        const originalIndex = linkedItens.findIndex(o => o === existente) + 1
                        existente.descricao = `${existente.descricao} [UNIFICADO - Linhas Originais: ${originalIndex}, ${indexOriginal + 1}]`
                    } else {
                        existente.descricao = existente.descricao.replace(']', `, ${indexOriginal + 1}]`)
                    }
                } else {
                    itensUnificados.push({ 
                        ...item,
                        quantidade: Number(item.quantidade || 0),
                        valor_unitario: Number(item.valor_unitario || 0),
                        valor_total: Number(item.valor_total || 0)
                    })
                }
            })

            const finalNumero = (docInfo?.numero_arp || docInfo?.numero_ata || '').replace(/[^0-9/]/g, '')
            if (finalNumero) setNumeroArp((prev: string) => prev || finalNumero)
            
            const emissorData = docInfo?.orgao_emissor || docInfo?.entidade || {}
            if (emissorData.nome) setEmissor((prev: string) => prev || emissorData.nome)
            
            const totalSoma = itensUnificados.reduce((acc, it) => acc + (Number(it.valor_unitario || 0) * Number(it.quantidade || 0)), 0)
            
            // REGRA SÊNIOR: A soma dos itens é a âncora da verdade absoluta do faturamento.
            // O valor do cabeçalho pode vir incompleto (item cortado na virada de página, OCR imperfeito, etc.).
            // A soma dos itens individuais extraídos e validados matematicamente é sempre mais confiável.
            setValorTeto(totalSoma.toFixed(2));

            if (valorTetoHeaderLocal > 0 && Math.abs(valorTetoHeaderLocal - totalSoma) > 1) {
                console.log(`[Pipeline Info] Ajustando teto do cabeçalho de R$ ${valorTetoHeaderLocal.toFixed(2)} para a soma real dos itens: R$ ${totalSoma.toFixed(2)}`);
            }
            
            const rawEstado = emissorData.uf || emissorData.estado || ''
            const normalizedEstado = normalizeState(rawEstado)
            if (normalizedEstado) setUf((prev: string) => prev || normalizedEstado)
            const municipioChunk = sanitizeMunicipality(emissorData.municipio || '')
            if (municipioChunk) setMunicipio((prev: string) => prev || municipioChunk)
            const regiaoChunk = normalizedEstado ? getStateRegion(normalizedEstado) : ''
            if (regiaoChunk) setRegiao((prev: string) => prev || regiaoChunk)
            
            const dataChunk = toInputDate(docInfo?.data_emissao)
            if (dataChunk) setDataEmissao((prev: string) => prev || dataChunk)

            // =================================================================
            // AUDITORIA MATEMÁTICA PÓS-UNIFICAÇÃO
            // =================================================================
            ;(() => {
              let somaTotal = 0
              let erros = 0
              console.log('[Auditoria] === INICIANDO AUDITORIA MATEMÁTICA DOS ITENS ===')
              itensUnificados.forEach((item, index) => {
                const qtd = Number(item.quantidade)
                const vUnitario = Number(item.valor_unitario)
                const vTotalLido = Number(item.valor_total)

                const isMissingData = !qtd || !vUnitario || !vTotalLido || isNaN(qtd) || isNaN(vUnitario) || isNaN(vTotalLido) || qtd <= 0 || vUnitario <= 0 || vTotalLido <= 0

                let hasError = false;
                let expectedText = "";
                let actualText = "";

                if (isMissingData) {
                  hasError = true;
                  expectedText = "Dados de quantidade, unitário e total válidos e maiores que zero";
                  actualText = `Qtd: ${item.quantidade}, Unit: ${item.valor_unitario}, Total Lido: ${item.valor_total}`;
                } else {
                  const vTotalCalculado = Number((qtd * vUnitario).toFixed(2));
                  if (Math.abs(vTotalCalculado - vTotalLido) > 0.02) {
                    hasError = true;
                    expectedText = `Qtd(${qtd}) × Unit(R$${vUnitario}) = R$${vTotalCalculado}`;
                    actualText = `R$${vTotalLido}`;
                  }
                }

                somaTotal += vTotalLido || 0;

                if (hasError) {
                  console.warn(`🚨 [Auditoria] Inconsistência no Item ${index + 1} (${item.codigo_item || item.codigo || 'S/N'} - ${String(item.descricao || '').slice(0, 60)})`);
                  console.warn(`   Esperado : ${expectedText}`);
                  console.warn(`   Lido     : ${actualText}`);
                  erros++;
                }
              })
              console.log('[Auditoria] === RESULTADO ===')
              console.log(`[Auditoria] Soma Total Lida (Valor Global Real): R$ ${somaTotal.toFixed(2)}`)
              console.log(`[Auditoria] Itens com inconsistência matemática: ${erros} / ${itensUnificados.length}`)
              console.log('[Auditoria] ==========================================')
            })()

            // Armazena e finaliza o estado dos itens no componente, inferindo a subcategoria por recorrência
            const itensComSubcat = await autoDeduceSubcategories(itensUnificados)
            setItensIA(itensComSubcat)
            
            // Pre-fill the ATA-level subcategory by deducing it from the items
            const deducedSub = await deduceAtaSubcategory(itensComSubcat)
            setSubcategoriaAta(deducedSub)
            setArquivo(file)
            
            const totalFiltro = itensFiltradosFinais.length
            const totalUnificado = itensUnificados.length
            
            if (totalUnificado < totalFiltro) {
                toast.success(`Leitura concluída! Encontrados ${totalFiltro} itens da empresa alvo (de ${rawAccumulatedItens.length} itens totais no documento), consolidados em ${totalUnificado} linhas devido a duplicidades de valor/descrição.`)
            } else {
                toast.success(`Leitura concluída! Encontrados ${totalUnificado} itens da empresa alvo (de ${rawAccumulatedItens.length} itens totais no documento).`)
            }
        }
     } catch(err) {
        toast.error('Erro no fatiamento da IA: ' + (err instanceof Error ? err.message : String(err)))
     } finally {
        setLoadingIA(false)
        setProgress(0)
        setStatusLog('')
     }
  }

  async function handleSalvar() {
    if (!dataEmissao) {
      toast.error('A Data de Assinatura/Emissão é OBRIGATÓRIA para cadastrar a ATA.')
      return
    }

    if (!dataValidade) {
      toast.error('A Data de Fim de Vigência é OBRIGATÓRIA para cadastrar a ATA.')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessão expirada.')

      const { data: profile } = await supabase.from('profiles').select('nivel, setor').eq('id', user.id).maybeSingle()
      console.log('User Level:', profile?.nivel)

      let arquivoCaminho = null
      if (arquivo) {
        const fileName = `${Date.now()}.${arquivo.name.split('.').pop()}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(`atas/${fileName}`, arquivo)
        
        if (uploadError) throw uploadError
        arquivoCaminho = uploadData.path
      }

      const resEntidade = await findOrCreateEntidade(
        emissor, 
        uf, 
        user.id, 
        municipio, 
        regiao,
        cnpj
      )
      const finalEntidadeId = resEntidade.id

      // 0. Verificar Duplicidade
      const { data: existingAta } = await supabase
        .from('atas')
        .select('id')
        .eq('numero_arp', numeroArp)
        .eq('entidade_id', finalEntidadeId)
        .maybeSingle()

      if (existingAta) {
        toast.error(`Atenção: Já existe uma ATA cadastrada com o número ${numeroArp} para este Órgão Gerenciador.`)
        setLoading(false)
        return
      }

      // 1. Salvar a ATA
      const { data: ata, error: ataError } = await supabase.from('atas').insert([{
          numero_arp: numeroArp,
          entidade_gerenciadora: emissor,
          entidade_id: finalEntidadeId,
          valor_global: cleanCurrency(valorTeto),
          data_assinatura: dataEmissao,
          data_validade: dataValidade,
          owner_id: user.id,
          assigned_to: isOP ? user.id : (assignedTo || null),
          distributed_at: (isOP || assignedTo) ? new Date().toISOString() : null,
          status: 'ATIVO',
          arquivo_caminho: arquivoCaminho,
          uf: uf || null,
          objeto_ata: objetoAta || null,
          subcategoria: subcategoriaAta || null,
          tipo_documento: tipoDoc,
          parent_ata_id: (tipoDoc === 'ADESAO' || tipoDoc === 'ADITIVO') ? parentAtaId : null
        }]).select().single()
        
        if (ataError) throw ataError

        if (ata && itensIA.length > 0) {
            const rowsToInsert = (itensIA || []).map((it, idx) => {
                const rawQty = it.quantidade;
                const qtyNum = Number(rawQty) || 0;
                const isNotInt = !Number.isInteger(qtyNum);
                const finalQty = isNotInt ? Math.floor(qtyNum) : qtyNum;
                const finalDesc = isNotInt 
                  ? `${it.descricao} (${rawQty} - quantidade original não é um número inteiro)` 
                  : it.descricao;

                return {
                    ata_id: ata.id,
                    numero_item: idx + 1,
                    descricao: finalDesc,
                    quantidade_registrada: finalQty,
                    unidade: it.unidade,
                    valor_unitario: it.valor_unitario,
                    marca: it.marca || null,
                    lote: it.lote || null,
                    codigo_item: it.codigo || it.codigo_item || null,
                    mapeamento_ia: it.codigo_mapeamento_ia || null,
                    subcategoria: it.subcategoria || null,
                    quantidade_abatida: 0,
                    produto_catalogo_id: it.produto_catalogo_id || null
                };
            })
            const { error: errorItens } = await supabase.from('itens_ata').insert(rowsToInsert)
            if (errorItens) {
                console.error('Erro ao salvar itens da ata:', errorItens)
                toast.error(`A Ata foi criada, mas houve um erro ao salvar os itens: ${errorItens.message}`)
                return
            }
        }

      toast.success('Ata cadastrada com sucesso!')
      clearFormCache()
      if (aoSalvar) aoSalvar()
      navigate('/vendas')
    } catch (err) {
      console.error('[Save Error]', err)
      const supaErr = err as any
      const message = supaErr?.message || (err instanceof Error ? err.message : String(err))
      const details = supaErr?.details || supaErr?.hint || ''
      toast.error(`Erro ao salvar: ${message}${details ? ` (${details})` : ''}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileUp className="w-5 h-5 text-brand-accent" />
              <div>
                <CardTitle>Importação Inteligente de ATA / ARP</CardTitle>
                <p className="text-xs text-zinc-500 font-normal">Cadastre novos registros de preços via PDF ou Planilha Excel (.xlsx, .csv)</p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-8">
          <div 
            className={`p-6 rounded-xl border-2 border-dashed transition-all relative overflow-hidden space-y-4 backdrop-blur-sm ${
              isDragging 
                ? 'border-brand-accent bg-brand-accent/20 dark:bg-brand-accent/30' 
                : 'border-brand-accent/20 dark:border-brand-accent/10 bg-brand-accent/5 dark:bg-brand-accent/5 hover:bg-brand-accent/10 dark:hover:bg-brand-accent/10'
            }`}>
            
            {isDragging && <div className="absolute inset-0 z-50 pointer-events-none bg-transparent" />}

            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDragging ? 'bg-brand-accent text-primary-foreground animate-bounce' : 'bg-brand-muted/30 text-brand-accent'}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold block">Importação Inteligente (PDF / Excel)</span>
                  <span className="text-xs text-zinc-500">Arraste seu PDF ou Planilha Excel (.xlsx, .csv) aqui</span>
                </div>
              </div>
              <Label htmlFor="file-upload" className="bg-brand-accent hover:opacity-90 text-primary-foreground px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 transition-shadow hover:shadow-lg shadow-brand-accent/20">
                {loadingIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loadingIA ? 'Lendo...' : 'Selecionar Arquivo'}
                <input id="file-upload" type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={handleArquivoIA} disabled={loadingIA} />
              </Label>
            </div>
            {loadingIA && (
              <div className="space-y-1 relative z-10">
                <Progress value={progress} className="h-1.5" />
                {statusLog && (
                  <p className="text-[11px] text-brand-accent/80 font-medium flex items-center gap-1.5 animate-pulse">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-accent animate-ping" />
                    {statusLog}
                  </p>
                )}
              </div>
            )}
          </div>

          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-5">
                {/* Seletor de Tipo de Documento: ATA vs CONTRATO vs ADESÃO vs ADITIVO */}
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <Label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-brand-accent" />
                    Tipo / Modalidade do Documento
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'ATA', label: 'Ata de Reg. Preços (ARP)', icon: '📜' },
                      { id: 'CONTRATO', label: 'Contrato Administrativo', icon: '📄' },
                      { id: 'ADESAO', label: 'Adesão (Carona)', icon: '🤝' },
                      { id: 'ADITIVO', label: 'Termo Aditivo', icon: '📝' },
                    ].map((tipo) => (
                      <button
                        key={tipo.id}
                        type="button"
                        onClick={() => {
                          setTipoDoc(tipo.id as any)
                          if (tipo.id !== 'ADESAO' && tipo.id !== 'ADITIVO') setParentAtaId(null)
                        }}
                        className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 text-center ${
                          tipoDoc === tipo.id
                            ? 'bg-brand-accent text-white border-brand-accent shadow-md shadow-brand-accent/20'
                            : 'bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-850'
                        }`}
                      >
                        <span>{tipo.icon}</span>
                        <span>{tipo.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Se for Adesão (Carona) ou Aditivo, exibir o seletor de Ata Mãe */}
                  {(tipoDoc === 'ADESAO' || tipoDoc === 'ADITIVO') && (
                    <div className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2 mt-2">
                      <Label className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase flex items-center gap-1">
                        <Link2 className="w-3.5 h-3.5" />
                        Vincular à Ata de Origem (Ata Mãe)
                      </Label>
                      <Select value={parentAtaId || 'none'} onValueChange={(val) => setParentAtaId(val === 'none' ? null : val)}>
                        <SelectTrigger className="bg-white dark:bg-zinc-900 border-amber-200 dark:border-amber-800 text-xs font-bold">
                          <SelectValue placeholder="Selecione a ARP Mãe de origem..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione uma ARP...</SelectItem>
                          {parentAtas.map((parent) => (
                            <SelectItem key={parent.id} value={parent.id}>
                              ARP nº {parent.numero_arp} — {parent.entidade_gerenciadora || 'Órgão s/ nome'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {tipoDoc === 'ADESAO' && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">
                          ℹ️ <strong>Nota de Adesão (Carona):</strong> O saldo desta Adesão será isolado para o novo cliente e <u>não causará baixa</u> na ARP Mãe original.
                        </p>
                      )}
                      {tipoDoc === 'ADITIVO' && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">
                          ℹ️ <strong>Nota de Aditivo:</strong> Este termo aditivo será vinculado diretamente ao contrato/ARP original.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div ref={clientContainerRef} className="p-4 rounded-xl bg-brand-muted/10 border border-brand-muted/20 relative">
                   <Label className="text-brand-accent font-bold mb-2 block uppercase text-xs">Conferir Órgão/Cliente</Label>
                   <div className="relative">
                     <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                     <Input 
                       value={emissor} 
                       onChange={e => {
                         setEmissor(e.target.value)
                         setEntidadeSelecionada('new')
                         setIsOpenClientDropdown(true)
                       }} 
                       onFocus={() => setIsOpenClientDropdown(true)}
                       placeholder="Buscar ou digitar nome do Órgão/Cliente..." 
                       className="pl-8 bg-background mb-2" 
                     />
                   </div>

                   {/* Custom Autocomplete Dropdown */}
                   {isOpenClientDropdown && (
                     <div className="absolute left-4 right-4 z-50 mt-1 max-h-[220px] overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl scrollbar-thin">
                       <button
                         type="button"
                         onClick={() => {
                           setEntidadeSelecionada('new')
                           setIsOpenClientDropdown(false)
                         }}
                         className="w-full text-left px-3.5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-xs font-bold text-brand-accent border-b border-zinc-100 dark:border-zinc-850"
                       >
                         + Cadastrar como Novo Órgão/Cliente: "{emissor}"
                       </button>
                       {filteredEntidades.length === 0 ? (
                         <div className="p-3 text-center text-xs text-zinc-400 italic">
                           Nenhum órgão cadastrado com esse nome
                         </div>
                       ) : (
                         filteredEntidades.map(ent => (
                           <button
                             key={ent.id}
                             type="button"
                             onClick={() => {
                               setEntidadeSelecionada(String(ent.id))
                               setEmissor(ent.nome)
                               setIsOpenClientDropdown(false)
                             }}
                             className="w-full text-left px-3.5 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-all border-b border-zinc-100 dark:border-zinc-850 last:border-b-0 flex flex-col gap-0.5"
                           >
                             <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{ent.nome}</span>
                             <span className="text-[10px] text-zinc-400 font-semibold">{ent.municipio || 'Palmas'}/{ent.estado || 'TO'} - CNPJ: {ent.cnpj || '—'}</span>
                           </button>
                         ))
                       )}
                     </div>
                   )}
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-zinc-500 uppercase">Número da ATA/ARP</Label>
                      <Input value={numeroArp} onChange={e => setNumeroArp(e.target.value)} placeholder="000/0000" className="bg-zinc-50/50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-zinc-500 uppercase">Município do Órgão</Label>
                      <Input value={municipio} onChange={e => setMunicipio(e.target.value)} placeholder="Ex: Dueré" className="bg-zinc-50/50" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-zinc-500 uppercase">UF do Órgão</Label>
                      <Select value={uf} onValueChange={setUf}>
                        <SelectTrigger className="bg-zinc-50/50">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {BR_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-zinc-500 uppercase">Valor Global Homologado (Teto)</Label>
                      <Input 
                        value={valorTeto} 
                        onChange={e => setValorTeto(e.target.value)} 
                        placeholder="R$ 0,00" 
                        className="bg-zinc-50/50 font-mono font-bold text-brand-accent"
                      />
                      {valorTotalSaldoDisponivel !== null && Math.abs((parseBrazilianNumber(valorTeto) || 0) - valorTotalSaldoDisponivel) > 1 && (
                        <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-[10px] font-bold text-purple-700 dark:text-purple-300 flex items-center justify-between">
                          <span>Saldo Atual Livre:</span>
                          <span className="font-mono">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotalSaldoDisponivel)}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-zinc-500 uppercase">
                        Data Assinatura <span className="text-red-500 font-bold">*</span>
                      </Label>
                      <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} className="bg-zinc-50/50" required />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 backdrop-blur-sm">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase">Prazo de Validade (dias)</Label>
                      <Input 
                        type="number" 
                        value={prazoDias} 
                        onChange={e => setPrazoDias(e.target.value)} 
                        className="bg-white dark:bg-zinc-900 font-bold text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase">
                        Vigência ATA (Data Fim) <span className="text-red-500 font-bold">*</span>
                      </Label>
                      <Input 
                        type="date" 
                        value={dataValidade} 
                        onChange={e => handleDataValidadeChange(e.target.value)} 
                        className="bg-white dark:bg-zinc-900 font-bold text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
                        required
                      />
                    </div>
                  </div>

                  {/* Objeto da ATA e Subcategoria da ATA */}
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-zinc-500 uppercase">Objeto da ATA</Label>
                      <Select value={objetoAta || 'none'} onValueChange={val => setObjetoAta(val === 'none' ? '' : val)}>
                        <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850 h-10">
                          <SelectValue placeholder="Selecione o Objeto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione o Objeto...</SelectItem>
                          <SelectItem value="Material Hospitalar">Material</SelectItem>
                          <SelectItem value="Medicamento">Medicamento</SelectItem>
                          <SelectItem value="Dieta">Dieta</SelectItem>
                          <SelectItem value="Misto">Misto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-zinc-500 uppercase">Subcategoria (Opcional)</Label>
                      <Select value={subcategoriaAta || 'none'} onValueChange={val => setSubcategoriaAta(val === 'none' ? null : val)}>
                        <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850 h-10">
                          <SelectValue placeholder="Nenhuma Subcategoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma Subcategoria</SelectItem>
                          {SUBCATEGORIAS_OPCOES.map(sub => (
                            <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {!isOP && (
                    <div className="p-4 rounded-xl bg-brand-accent/5 border border-brand-accent/10 space-y-3">
                      <Label className="text-xs font-bold text-brand-accent uppercase">Atribuição de Responsável (Carga)</Label>
                      <Select value={assignedTo} onValueChange={setAssignedTo}>
                        <SelectTrigger className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850">
                          <SelectValue placeholder="Deixar sem atribuição (ADM apenas)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum (Visível apenas para ADM)</SelectItem>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.display_name?.toUpperCase() || u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-zinc-500 italic">
                        * Selecione o Operador que poderá utilizar esta ATA para gerar Empenhos.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                 <div className="flex items-center justify-between px-1">
                    <Label className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                       <PackageCheck className="w-4 h-4 text-brand-accent" />
                       Itens Extraídos ({itensIA.length})
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={handleAdicionarItemManual} className="text-xs h-7 gap-1 text-brand-accent border-brand-accent/30 hover:bg-brand-accent/10">
                        + Adicionar Item
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={clearFormCache} className="text-xs h-7 text-zinc-400 hover:text-red-500 transition-colors">Limpar Tudo</Button>
                    </div>
                 </div>

                  <div className="border border-zinc-100 dark:border-zinc-800 rounded-xl max-h-[550px] overflow-y-auto scrollbar-thin bg-zinc-50/30 dark:bg-zinc-900/20 shadow-inner backdrop-blur-sm relative">
                     <Table>
                       <TableHeader className="bg-zinc-100/50 dark:bg-zinc-800/80 sticky top-0 z-20">
                         <TableRow>
                           <TableHead className="w-[10px]"></TableHead>
                           <TableHead className="text-xs font-bold">Descrição</TableHead>
                           <TableHead className="text-right text-xs font-bold w-[90px]">Qtd</TableHead>
                           <TableHead className="text-right text-xs font-bold w-[110px]">R$ Unit.</TableHead>
                           <TableHead className="w-[40px] text-center"></TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {itensIA.length === 0 ? (
                           <TableRow>
                             <TableCell colSpan={5} className="h-40 text-center text-zinc-400 italic text-sm">
                               Aguardando upload do PDF ou clique em "+ Adicionar Item"...
                             </TableCell>
                           </TableRow>
                         ) : (
                           itensIA.map((it, idx) => (
                             <TableRow key={idx} className="hover:bg-brand-accent/5 group transition-colors border-zinc-100 dark:border-zinc-800/50">
                               <TableCell className="font-mono text-[10px] text-zinc-300">{(idx + 1).toString().padStart(2, '0')}</TableCell>
                               <TableCell className="relative overflow-visible min-w-[280px]">
                                 <ProductAutocomplete
                                   defaultValue={it.descricao}
                                   onChange={(val) => {
                                     const novaLista = [...itensIA]
                                     novaLista[idx].descricao = val
                                     novaLista[idx].produto_catalogo_id = null
                                     setItensIA(novaLista)
                                   }}
                                   onSelect={(product) => {
                                      const novaLista = [...itensIA]
                                      novaLista[idx].descricao = product.descricao_completa
                                      novaLista[idx].unidade = product.unidade_venda || it.unidade
                                      novaLista[idx].produto_catalogo_id = product.id
                                      
                                      let cat = (product.grupo || '').toUpperCase().trim()
                                      const CATEGORIAS_VALIDAS = ['MATERIAL HOSP', 'MEDICAMENTO', 'ODONTO', 'MOBILIÁRIO', 'ELETRÔNICOS', 'COSMÉTICO']
                                      if (cat === 'INSUMO' || cat === 'MATERIAL') cat = 'MATERIAL HOSP'
                                      if (cat === 'MEDICAMENTOS') cat = 'MEDICAMENTO'
                                      if (cat === 'MOBILIARIO') cat = 'MOBILIÁRIO'
                                      if (cat === 'ELETRONICOS_INFORMATICA') cat = 'ELETRÔNICOS'
                                      if (cat === 'COSMETICO') cat = 'COSMÉTICO'
                                      
                                      if (!CATEGORIAS_VALIDAS.includes(cat)) {
                                        const d = product.descricao_completa.toUpperCase()
                                        if (/MEDIC|COMPRIMIDO|CÁPSULA|CAPSULA|AMPOLA|INJETÁVEL|INJETAVEL|FRASCO AMPOLA|SULFATO|CLORIDRATO|DICLOFENACO|IBUPROFENO|DIPIRONA|CETOPROFENO|AMOXICILINA|AZITROMICINA|OMEPRAZOL|INSULINA|SORO GLICOSADO|SORO FISIOLÓG|ANTIBIÓTICO|ANTIBIOTIC|ANALGÉSICO/.test(d)) cat = 'MEDICAMENTO'
                                        else if (/ODONTO|DENTAL|DENTÁRIO|DENTARIO|ORTODON|PASTA DENTAL|BROCA DENTAL|CIMENTO DENTÁRIO|SUGADOR|ENDODON|EXTRATOR|ESPELHO CLÍNICO|ESPELHO BUCAL/.test(d)) cat = 'ODONTO'
                                        else if (/CADEIRA|MESA |ARMÁRIO|ARMARIO|ESTANTE|SOFÁ|SOFA|BANCADA|PRATELEIRA|POLTRONA|MACA |LEITO |CAMA HOSPITALAR|MOBILIÁRIO|MOBILIARIO|ARQUIVO DE AÇO|ARQUIVO METAL|GUARDA-ROUPA/.test(d)) cat = 'MOBILIÁRIO'
                                        else if (/COMPUTADOR|MONITOR|IMPRESSORA|TECLADO|MOUSE |NOBREAK|TABLET|SWITCH|ROTEADOR|NOTEBOOK|PROJETOR|WEBCAM|HD EXTERNO|SCANNER|CABO DE REDE|RACK/.test(d)) cat = 'ELETRÔNICOS'
                                        else cat = 'MATERIAL HOSP'
                                      }
                                      
                                      novaLista[idx].categoria = cat
                                      setItensIA(novaLista)
                                    }}
                                   placeholder="Buscar no catálogo ou digitar..."
                                   inputClassName="h-8 text-[11px] font-medium"
                                 />
                                 <div className="flex flex-wrap items-center gap-2 mt-1">
                                   <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono">{it.unidade}</span>
                                   {it.marca && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-muted/20 dark:bg-brand-accent/10 text-brand-accent italic font-medium">Marca: {it.marca}</span>}
                                   {it.fornecedor && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30 font-semibold uppercase font-sans">Fornecedor: {it.fornecedor}</span>}
                                 </div>
                               </TableCell>
                               <TableCell className="text-right p-1">
                                 <Input 
                                   type="number"
                                   step="any"
                                   value={it.quantidade} 
                                   onChange={(e) => {
                                     const val = Number(e.target.value) || 0
                                     const novaLista = [...itensIA]
                                     novaLista[idx].quantidade = val
                                     novaLista[idx].valor_total = Number((val * Number(novaLista[idx].valor_unitario || 0)).toFixed(2))
                                     setItensIA(novaLista)
                                     recalcularTeto(novaLista)
                                   }}
                                   className="h-7 text-right text-xs font-bold bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 px-1.5"
                                 />
                               </TableCell>
                               <TableCell className="text-right p-1">
                                 <Input 
                                   type="number"
                                   step="any"
                                   value={it.valor_unitario} 
                                   onChange={(e) => {
                                     const val = Number(e.target.value) || 0
                                     const novaLista = [...itensIA]
                                     novaLista[idx].valor_unitario = val
                                     novaLista[idx].valor_total = Number((val * Number(novaLista[idx].quantidade || 0)).toFixed(2))
                                     setItensIA(novaLista)
                                     recalcularTeto(novaLista)
                                   }}
                                   className="h-7 text-right text-xs font-mono font-bold text-brand-accent bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 px-1.5"
                                 />
                               </TableCell>
                               <TableCell className="text-center p-1">
                                 <Button 
                                   type="button"
                                   variant="ghost"
                                   size="icon"
                                   onClick={() => handleRemoverItem(idx)}
                                   title="Excluir item"
                                   className="h-7 w-7 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                                 >
                                   <Trash2 className="w-3.5 h-3.5" />
                                 </Button>
                               </TableCell>
                             </TableRow>
                           ))
                         )}
                       </TableBody>
                     </Table>
                  </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-zinc-100 dark:border-zinc-800">
               <Button variant="ghost" onClick={() => navigate('/vendas')} className="text-zinc-500 font-medium">Cancelar</Button>
               <Button 
                 onClick={handleSalvar} 
                 disabled={loading || itensIA.length === 0} 
                 className="bg-brand-accent hover:opacity-90 text-white font-bold px-10 h-12 gap-2 shadow-lg shadow-brand-accent/20"
                >
                 {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                 {loading ? 'SALVANDO...' : 'CONFIRMAR E SALVAR ATA'}
               </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isDragging && (
        <div 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
              const file = files[0];
              const isSupported = /\.pdf$|\.xlsx?$|\.csv$/i.test(file.name);
              if (isSupported) {
                const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                handleArquivoIA(fakeEvent);
              } else {
                toast.error('Por favor, arraste um arquivo PDF ou planilha Excel (.xlsx, .csv).');
              }
            }
          }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950/65 backdrop-blur-md border-4 border-dashed border-brand-accent m-4 rounded-2xl animate-in fade-in zoom-in duration-200"
        >
          <div className="pointer-events-none bg-zinc-900/80 dark:bg-zinc-950/60 border border-white/10 p-8 rounded-2xl max-w-md w-full mx-4 text-center space-y-6 shadow-2xl backdrop-blur-lg animate-in zoom-in-95 duration-300">
            <div className="mx-auto w-20 h-20 bg-brand-accent/15 border-2 border-brand-accent/30 rounded-full flex items-center justify-center text-brand-accent animate-pulse">
              <Sparkles className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-tight">Importação Inteligente de Ata</h3>
              <p className="text-sm text-zinc-400">
                Solte o arquivo PDF ou a Planilha Excel (.xlsx, .csv) em qualquer lugar para importar os dados instantaneamente
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-accent/10 border border-brand-accent/25 text-xs font-semibold text-brand-accent tracking-wide uppercase">
              <Upload className="w-3.5 h-3.5" /> Arquivos PDF ou Excel (.xlsx, .csv)
            </div>
          </div>
        </div>
      )}
    </div>
  )
}