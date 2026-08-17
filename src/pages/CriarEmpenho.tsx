import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { 
  FileUp, 
  Sparkles, 
  Upload, 
  Save,
  Loader2,
  Search,
  PackageCheck,
  FileText
} from 'lucide-react'

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
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '../components/ui/dialog'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../components/ui/select'

import { 
    insertAndSelectNota, 
    fetchEntidades, 
    findOrCreateEntidade,
    getSuggestedAssigneesForEntidade
} from '../lib/supabaseHelpers'
import { toast } from 'sonner'
import { extrairDadosEmpenho } from '../aiService' 
import { ProductAutocomplete } from '../components/ui/ProductAutocomplete' 
import { formatCurrency, cleanCurrency, normalizeState, getStateRegion, sanitizeMunicipality, isNotaModoSesau } from '../lib/utils'
import { useAuth } from '../AuthContext'
import type { Tables } from '../supabaseTypes'

interface CriarNotaProps {
  aoSalvar?: () => void
}

interface ItemTemp {
    descricao: string
    quantidade: number
    unidade: string
    valor_unitario: number
    valor_total?: number
    marca?: string
    lote?: string
    codigo?: string
    codigo_item?: string
    categoria: string
    codigo_mapeamento_ia?: string
    produto_catalogo_id?: number | null
}

const CATEGORIAS_OPCOES = [
    'MATERIAL HOSP',
    'MEDICAMENTO',
    'ODONTO',
    'MOBILIÁRIO',
    'ELETRÔNICOS',
    'DIETA',
    'COSMÉTICO'
]

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

const BR_STATES = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

// Helpers para o split de cliente SESAU/TO por tipo de produto
const isSesauTO = (name: string) => {
  const norm = (name || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return (
    norm.includes("FUNDO ESTADUAL DE SAUDE DO TOCANTINS") ||
    norm.includes("SESAU/TO") ||
    norm.includes("SESAU-TO") ||
    norm.includes("SESAU - TO") ||
    (norm.includes("SECRETARIA DE ESTADO DA SAUDE") && norm.includes("TOCANTINS")) ||
    (norm.includes("FUNDO ESTADUAL DE SAUDE") && norm.includes("TOCANTINS"))
  )
}

const getSesauTOClientNameForItems = (items: any[]) => {
  if (!items || items.length === 0) {
    return '(MATERIAIS) FUNDO ESTADUAL DE SAÚDE DO TOCANTINS - SESAU'
  }
  const categories = items.map(it => (it.categoria || '').toUpperCase().trim())
  if (categories.some(c => c.includes('MEDICAMENTO'))) {
    return '(MEDICAMENTOS) FUNDO ESTADUAL DE SAÚDE DO TOCANTINS - SESAU'
  }
  if (categories.some(c => c.includes('ODONTO'))) {
    return '(ODONTO) FUNDO ESTADUAL DE SAÚDE DO TOCANTINS - SESAU'
  }
  if (categories.some(c => c.includes('MOBILI'))) {
    return '(MOBILIÁRIO) FUNDO ESTADUAL DE SAÚDE DO TOCANTINS - SESAU'
  }
  if (categories.some(c => c.includes('ELETRO'))) {
    return '(ELETRÔNICOS) FUNDO ESTADUAL DE SAÚDE DO TOCANTINS - SESAU'
  }
  return '(MATERIAIS) FUNDO ESTADUAL DE SAÚDE DO TOCANTINS - SESAU'
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

export function CriarEmpenho({ aoSalvar }: CriarNotaProps) {
  const navigate = useNavigate()
  const { canCreate, isOP, profile, isSuperAdmin } = useAuth()

  const sector = (profile?.setor || '').toUpperCase()
  const canAssign = isSuperAdmin || 
                    profile?.nivel === 'DEV' || 
                    (profile?.nivel === 'ADM' && (sector === 'VENDAS' || sector === 'EMPENHOS'))

  // --- Estados ---
  const [entidades, setEntidades] = useState<Tables<'entidades'>[]>([])
  const [atas, setAtas] = useState<Tables<'atas'>[]>([])
  const [selectedAtaId, setSelectedAtaId] = useState('')
  const [contratos, setContratos] = useState<any[]>([])
  const [selectedContratoId, setSelectedContratoId] = useState('')
  
  // Carregamento de Cache Inicial
  const cachedData = JSON.parse(localStorage.getItem('form_cache_dados_empenho') || '{}')

  const [entidadeSelecionada, setEntidadeSelecionada] = useState(cachedData.entidadeSelecionada || '')
  const [numeroNe, setNumeroNe] = useState(cachedData.numeroNe || '')
  const [emissor, setEmissor] = useState(cachedData.emissor || '')
  const [cnpj, setCnpj] = useState(cachedData.cnpj || '')
  const [valorTeto, setValorTeto] = useState(cachedData.valorTeto || '')
  
  const [tipoDoc, setTipoDoc] = useState(cachedData.tipoDoc || 'NOTA DE EMPENHO')
  const [dataEmissao, setDataEmissao] = useState(cachedData.dataEmissao || '')
  const [prazoDias, setPrazoDias] = useState(cachedData.prazoDias || '0') 
  const [uf, setUf] = useState(cachedData.uf || '')
  const [demandaJudicial, setDemandaJudicial] = useState(false)
  const [dataPrazoCompras] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [assignedTo, setAssignedTo] = useState(cachedData.assignedTo || '')
  const [users, setUsers] = useState<Tables<'profiles'>[]>([])

  const [isOpenClientDropdown, setIsOpenClientDropdown] = useState(false)
  const clientContainerRef = useRef<HTMLDivElement>(null)

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
    return entidades.filter(e => 
      e.nome.toLowerCase().includes(emissor.toLowerCase())
    )
  }, [entidades, emissor])

  const [searchAta, setSearchAta] = useState('')
  const filteredAtas = useMemo(() => {
    if (!searchAta) return atas
    const term = searchAta.toLowerCase()
    return atas.filter(a => 
      a.numero_arp.toLowerCase().includes(term) || 
      (a.entidade_gerenciadora || '').toLowerCase().includes(term)
    )
  }, [atas, searchAta])

  const [itensIA, setItensIA] = useState<ItemTemp[]>(() => {
    const cached = localStorage.getItem('form_cache_itens_empenho')
    return cached ? JSON.parse(cached) : []
  })
  const [progress, setProgress] = useState(0)
  const [loadingIA, setLoadingIA] = useState(false)
  const [statusLog, setStatusLog] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const [pendingTerritorialData, setPendingTerritorialData] = useState<{
    municipio: string
    estado: string
    regiao: string
  } | null>(null)

  useEffect(() => {
    async function loadSuggestedAssignee() {
      if (!canAssign) return
      if (!entidadeSelecionada || entidadeSelecionada === 'new') return
      
      const suggestions = await getSuggestedAssigneesForEntidade(entidadeSelecionada)
      
      if (suggestions.length > 0) {
        if (!assignedTo || !suggestions.find(s => s.id === assignedTo)) {
           setAssignedTo(suggestions[0].id)
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
      numeroNe,
      emissor,
      valorTeto,
      tipoDoc,
      dataEmissao,
      prazoDias,
      entidadeSelecionada,
      uf,
      cnpj,
      assignedTo
    }
    localStorage.setItem('form_cache_dados_empenho', JSON.stringify(cache))
    localStorage.setItem('form_cache_itens_empenho', JSON.stringify(itensIA))
  }, [numeroNe, emissor, valorTeto, tipoDoc, dataEmissao, prazoDias, itensIA, entidadeSelecionada, uf, assignedTo])

  function clearFormCache() {
    localStorage.removeItem('form_cache_dados_empenho')
    localStorage.removeItem('form_cache_itens_empenho')
  }

  function resetForm() {
    setEntidadeSelecionada('')
    setNumeroNe('')
    setEmissor('')
    setValorTeto('')
    setTipoDoc('NOTA DE EMPENHO')
    setDataEmissao('')
    setPrazoDias('0')
    setUf('')
    setArquivo(null)
    setItensIA([])
    setSelectedAtaId('')
    setSelectedContratoId('')
    clearFormCache()
    setPendingTerritorialData(null)
    delete (window as any)._pendingTerritorialData
    
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
      e.stopPropagation()
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsDragging(true)
      }
    }
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
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

    const { data: resAtas } = await supabase.from('atas').select('*').eq('status', 'ATIVO')
    if (resAtas) setAtas(resAtas)

    const { data: resContratos } = await supabase.from('contratos').select('*, ata:atas(numero_arp)').order('created_at', { ascending: false })
    if (resContratos) setContratos(resContratos || [])

    const { data: myProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    const mySector = (myProfile?.setor || '').toUpperCase()
    const myCanAssign = user.email === 'andrews.cs16@gmail.com' || 
                        myProfile?.nivel === 'DEV' || 
                        (myProfile?.nivel === 'ADM' && (mySector === 'VENDAS' || mySector === 'EMPENHOS'))

    if (myCanAssign) {
      const { data: userData } = await supabase
        .from('profiles')
        .select('*')
        .neq('setor', 'VENDAS_PRIVADO')
        .order('display_name')
      if (userData) {
        setUsers(userData)
      }
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

  async function handleArquivoIA(e: React.ChangeEvent<HTMLInputElement>) {
     if (!e.target.files?.length) return
     const file = e.target.files[0]
     setLoadingIA(true)
     setProgress(10)
     setStatusLog('📄 Lendo e preparando o documento...')
     
     try {
        setStatusLog('🔍 Extraindo dados do documento com IA...')
        const dados = await extrairDadosEmpenho(file)
        setProgress(80)
        setStatusLog('⚙️ Processando dados extraídos...')
        console.log('[AI Debug] Dados Brutos recebidos pela IA:', dados)
        
        if(dados) {
            if (dados.fornecedor_valido === false) {
                const fornNome = dados.fornecedor_nome_detectado || 'Empresa terceira'
                toast.error(
                    `Importação bloqueada! O fornecedor deste documento é "${fornNome}". O sistema permite importações apenas da ROSAFARM ou APROMEDICA.`,
                    { duration: 10000 }
                )
                setStatusLog(`⚠️ Importação cancelada: Fornecedor "${fornNome}" não autorizado.`)
                setProgress(0)
                setLoadingIA(false)
                return
            }

            // 1. NÚMERO (Suporte a NÚMERO, numero_ne, n_empenho)
            const finalNumero = dados.numero_ne || dados.NÚMERO || dados.numero_ata || dados.numero_empenho || dados.numero_documento || dados.n_empenho || ''
            setNumeroNe(finalNumero)
            
            // 2. EMISSOR / ENTIDADE (Suporte a ENTIDADE, orgao_emissor, etc)
            const emissorInfo = dados.orgao_emissor || dados.ENTIDADE || dados.orgao_gerenciador || dados.cliente || dados.entidade || {}
            const extractedEmissor = emissorInfo.nome || emissorInfo.orgao || dados.emissor || dados.orgao || ''
            setEmissor(extractedEmissor)
            setCnpj(emissorInfo.cnpj || '')
            
            // 3. VALOR TOTAL / TETO (Refinado com cálculos)
            const valorExtraido = dados.valor_total_documento || dados.VALOR || dados.valor_total_ata || dados.valor_total || dados.montante_total

            // 4. DADOS TERRITORIAIS
            let extMunicipio = sanitizeMunicipality(emissorInfo.municipio || dados.municipio || '');
            if (extMunicipio && extMunicipio.toLowerCase().includes('inhumas')) {
                console.warn('[AI/Geográfico] Ignorando município Inhumas detectado, pois coincide com a sede do fornecedor.');
                extMunicipio = '';
            }

            const rawEstado = emissorInfo.estado || dados.estado || '';
            const normalizedEstado = normalizeState(rawEstado);
            const territorialData = {
                municipio: extMunicipio,
                estado: normalizedEstado,
                regiao: getStateRegion(normalizedEstado)
            }

            // 4a. Resolução via CEP do órgão (como fallback se a IA não identificou a cidade)
            const cepOrgao = (emissorInfo.cep || dados.cep_orgao || '').replace(/\D/g, '')
            const cepIgnorado = cepOrgao.startsWith('7540') || cepOrgao === '77006534';
            if (cepOrgao.length === 8 && !cepIgnorado && !territorialData.municipio) {
                setStatusLog('📍 Consultando CEP para validar localidade...')
                try {
                    const cepResp = await fetch(`https://viacep.com.br/ws/${cepOrgao}/json/`)
                    const cepData = await cepResp.json()
                    if (!cepData.erro) {
                        const localidadeResolvida = sanitizeMunicipality(cepData.localidade || '');
                        if (localidadeResolvida && !localidadeResolvida.toLowerCase().includes('inhumas')) {
                            territorialData.municipio = localidadeResolvida
                            if (cepData.uf && BR_STATES.includes(cepData.uf)) {
                                territorialData.estado = cepData.uf
                                territorialData.regiao = getStateRegion(cepData.uf)
                            }
                            console.log(`[CEP] Resolvido: ${cepData.localidade}/${cepData.uf} via CEP ${cepOrgao}`)
                        } else {
                            console.warn(`[CEP] Ignorando localidade resolvida via CEP: ${localidadeResolvida}`);
                        }
                    }
                } catch (cepErr) {
                    console.warn('[CEP] Falha na consulta ViaCEP:', cepErr)
                }
            }

            if (territorialData.estado && BR_STATES.includes(territorialData.estado)) {
                setUf(territorialData.estado)
            }

            // Tentativa de Match de Entidade (Busca Inteligente)
            if (extractedEmissor) {
                const cleanEmissor = extractedEmissor.replace(/prefeitura|município|municipio|pm\s+|p\.m\.|- mt|- go|- ms/gi, '').trim().toLowerCase()
                
                const match = (entidades || []).find(ent => {
                    const cleanEnt = ent.nome.replace(/prefeitura|município|municipio|pm\s+|p\.m\.|- mt|- go|- ms/gi, '').trim().toLowerCase()
                    
                    // 1. Verifica compatibilidade de nome
                    const nameMatches = cleanEnt.includes(cleanEmissor) || cleanEmissor.includes(cleanEnt)
                    if (!nameMatches) return false
                    
                    // 2. Se ambos tiverem município especificado, eles DEVEM coincidir
                    if (ent.municipio && territorialData.municipio) {
                        const entMun = ent.municipio.toLowerCase().trim()
                        const docMun = territorialData.municipio.toLowerCase().trim()
                        if (entMun !== docMun) return false
                    }
                    
                    // 3. Se ambos tiverem estado especificado, eles DEVEM coincidir
                    if (ent.estado && territorialData.estado) {
                        const entEst = ent.estado.toUpperCase().trim()
                        const docEst = territorialData.estado.toUpperCase().trim()
                        if (entEst !== docEst) return false
                    }
                    
                    return true
                })

                if (match) {
                    setEntidadeSelecionada(String(match.id))
                    setEmissor(match.nome)
                } else {
                    setEntidadeSelecionada('new')
                    setPendingTerritorialData(territorialData)
                }
            }

            // 5. DATAS E TIPO DE DOCUMENTO
            const datas = dados.DATAS || {}
            const isAta = dados.tipo_documento === 'ATA DE REGISTRO DE PREÇOS' || !!dados.numero_ata || !!dados.itens_registrados
            
            if(isAta) {
                setTipoDoc('ATA DE REGISTRO DE PREÇOS')
                setDataEmissao(toInputDate(dados.data_assinatura || dados.data_emissao || datas.data_emissao))
                setPrazoDias('0')
            } else {
                setTipoDoc(dados.TIPO_DOCUMENTO || dados.tipo_documento || 'NOTA DE EMPENHO')
                setDataEmissao(toInputDate(dados.data_emissao || datas.data_emissao || dados.data_assinatura))
                setPrazoDias('0')
            }

            // 6. ITENS (Suporte a ITENS, itens, produtos, servicos)
            const brutaItensRaw = dados.itens || dados.ITENS || dados.itens_registrados || dados.produtos || dados.servicos || []
            const brutaItens = Array.isArray(brutaItensRaw) ? brutaItensRaw : [brutaItensRaw]
            
            // Pós-processamento de Itens (Cálculos de Backup)
            const listaItens: ItemTemp[] = (brutaItens as any[]).filter(it => it && typeof it === 'object').map(it => {
                let qtd = cleanCurrency(it.quantidade)
                let vUnit = cleanCurrency(it.valor_unitario)
                const vTotal = cleanCurrency(it.valor_total || (qtd * vUnit))

                // Validação de Segurança 1: Se a quantidade capturada pela IA divergir do total/unitario (ex: pegou a apresentação 'CX 25 UN' como Qtd 25 em vez de 10)
                if (vUnit > 0 && vTotal > 0) {
                    const qtdEsperada = vTotal / vUnit
                    const diffActual = Math.abs(qtd * vUnit - vTotal)
                    if (diffActual > 0.05 && Math.abs(qtdEsperada * vUnit - vTotal) <= 0.05) {
                        console.warn(`[AI Correction] Item "${it.descricao}" tinha Qtd=${qtd}, Unit=${vUnit}, Total=${vTotal}. Corrigindo Qtd para ${qtdEsperada}`)
                        qtd = Math.round(qtdEsperada * 10000) / 10000
                    }
                }

                // Validação de Segurança 2: Se o unitário capturado for idêntico ao total mas a quantidade for > 1,
                // há uma alta probabilidade da IA ter confundido as colunas no layout do PDF.
                if (qtd > 1 && Math.abs(vUnit - vTotal) < 0.01 && vTotal > 0) {
                    console.warn(`[AI Correction] Item "${it.descricao}" capturado com Unitário == Total para Qtd > 1. Recalculando unitário...`)
                    vUnit = vTotal / qtd
                }
                
                // Normalização das categorias da IA para garantir match no Select
                let cat = (it.categoria || '').toUpperCase().trim()
                if (cat === 'INSUMO') cat = 'MATERIAL HOSP'
                if (cat === 'MEDICAMENTOS') cat = 'MEDICAMENTO'
                if (cat === 'MOBILIARIO') cat = 'MOBILIÁRIO'
                if (cat === 'ELETRONICOS_INFORMATICA') cat = 'ELETRÔNICOS'
                if (cat === 'COSMETICO') cat = 'COSMÉTICO'

                // Se não for uma das permitidas, deixa em branco (ou detecta inteligente pela descrição)
                if (!CATEGORIAS_OPCOES.includes(cat)) {
                  cat = detectCategoriaFromDesc(it.descricao || '')
                }

                return {
                    ...it,
                    quantidade: qtd,
                    valor_unitario: vUnit,
                    valor_total: vTotal,
                    categoria: cat,
                    unidade: it.unidade || it.und || it.un || 'UN'
                }
            })

            // Cálculo do Valor Total do Documento (se insuficiente)
            if (!valorExtraido || isNaN(Number(valorExtraido)) || Number(valorExtraido) === 0) {
                const somaTotal = listaItens.reduce((acc, it) => acc + (it.valor_total || 0), 0)
                setValorTeto(String(somaTotal.toFixed(2)))
            } else {
                setValorTeto(String(valorExtraido))
            }

            setStatusLog('Cruzando itens com o catálogo de produtos...')
            const linkedItens = await linkItemsToCatalog(listaItens)
            setItensIA(linkedItens)
            setArquivo(file)
            
            toast.success('Leitura completa e processada com vínculo do catálogo!')
        }
     } catch(err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.error('Erro na IA: ' + message)
     } finally {
        setLoadingIA(false)
        setProgress(0)
        setStatusLog('')
     }
  }



  async function handleSalvar() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessão expirada.')

      // Buscar perfil para automação de carga e setor
      const { data: profile } = await supabase.from('profiles').select('nivel, setor').eq('id', user.id).maybeSingle()

      let arquivoCaminho = null
      if (arquivo) {
        const fileName = `${Date.now()}.${arquivo.name.split('.').pop()}`
        const { data } = await supabase.storage.from('documentos').upload(`cadastros/${fileName}`, arquivo)
        if (data) arquivoCaminho = data.path
      }

      let finalEntidadeId: any = (entidadeSelecionada && entidadeSelecionada !== 'new') ? entidadeSelecionada : null

      // Se o campo de texto do emissor foi apagado mas há uma entidade selecionada no dropdown, usa o nome dela
      let finalEmissor = emissor
      if (!finalEmissor && finalEntidadeId) {
          const entMatch = entidades.find(e => String(e.id) === String(finalEntidadeId))
          if (entMatch) finalEmissor = entMatch.nome
      }

      // Se for SESAU/TO, dividimos de acordo com a categoria dos itens
      const isSesau = finalEmissor && (
        isSesauTO(finalEmissor) ||
        (finalEntidadeId && entidades.find(e => String(e.id) === String(finalEntidadeId) && isSesauTO(e.nome)))
      )

      if (isSesau) {
        finalEmissor = getSesauTOClientNameForItems(itensIA)
        const t: any = pendingTerritorialData || {}
        const ent = await findOrCreateEntidade(finalEmissor, uf || t.estado || 'TO', user.id, t.municipio || 'Palmas', t.regiao || 'Norte', cnpj || '13849028000140')
        finalEntidadeId = ent.id
      } else if ((entidadeSelecionada === 'new' || !finalEntidadeId) && finalEmissor) {
          const t: any = pendingTerritorialData || {}
          const ent = await findOrCreateEntidade(finalEmissor, uf || t.estado || '', user.id, t.municipio, t.regiao, cnpj)
          finalEntidadeId = (ent as any).id
      }

      let notaId: number | null = null

      // Cálculo de data de vencimento
      const dataBase = dataEmissao ? new Date(dataEmissao) : new Date()
      const vencimento = new Date(dataBase)
      vencimento.setDate(vencimento.getDate() + (Number(prazoDias) || 0))
      const dataVencimentoFinal = vencimento.toISOString().split('T')[0]

      // 0. Verificar Duplicidade (Normalizada)
      const cleanNumNe = numeroNe.trim().toUpperCase()
      
      if (tipoDoc === 'ATA DE REGISTRO DE PREÇOS') {
        const { data: exAta } = await supabase
          .from('atas')
          .select('id')
          .ilike('numero_arp', cleanNumNe)
          .eq('entidade_id', finalEntidadeId as number)
          .maybeSingle()

        if (exAta) {
          toast.error(`Atenção: Já existe uma ATA cadastrada com o número ${numeroNe} para este Órgão.`)
          setLoading(false)
          return
        }
      } else {
        const { data: exNe } = await supabase
          .from('notas')
          .select('id')
          .ilike('numero_ne', cleanNumNe)
          .eq('entidade_id', finalEntidadeId as number)
          .maybeSingle()

        if (exNe) {
          toast.error(`Atenção: Já existe um Empenho (NE) cadastrado com o número ${numeroNe} para este Órgão.`)
          setLoading(false)
          return
        }
      }

      if (tipoDoc === 'ATA DE REGISTRO DE PREÇOS') {
        const { data: ata, error: ataError } = await supabase.from('atas').insert([{
          numero_arp: numeroNe, 
          entidade_gerenciadora: emissor, 
          entidade_id: finalEntidadeId,
          data_validade: dataVencimentoFinal, 
          valor_global: cleanCurrency(valorTeto), 
          owner_id: user.id, 
          status: 'ATIVO', 
          arquivo_caminho: arquivoCaminho,
          uf: uf || null
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
                    valor_unitario: Number(it.valor_unitario) || 0,
                    marca: it.marca || null,
                    mapeamento_ia: it.codigo_mapeamento_ia || null,
                    quantidade_abatida: 0,
                    produto_catalogo_id: it.produto_catalogo_id || null
                };
            })
            const { error: errorItens } = await supabase.from('itens_ata').insert(rowsToInsert)
            if (errorItens) {
                console.error('Erro ao salvar itens da ata:', errorItens)
                toast.error(`O documento foi criado, mas houve um erro ao salvar os itens da Ata: ${errorItens.message}`)
                return
            }
        }
      } else {
        const { data: nota, error } = await insertAndSelectNota([{ 
          numero_ne: numeroNe, 
          emissor: finalEmissor, 
          entidade_id: finalEntidadeId, 
          valor_total_teto: cleanCurrency(valorTeto),
          tipo_documento: tipoDoc, 
          status_geral: 'PENDENTE', 
          data_recebimento: new Date().toISOString(),
          data_emissao: dataEmissao || null, 
          previsao_entrega: dataVencimentoFinal, 
          data_prazo_compras: dataPrazoCompras || null, 
          arquivo_caminho: arquivoCaminho,
          ata_id: (selectedAtaId && selectedAtaId !== 'none') ? selectedAtaId : null, 
          contrato_id: (selectedContratoId && selectedContratoId !== 'none') ? selectedContratoId : null,
          owner_id: user.id,
          assigned_to: isOP ? user.id : (canAssign && assignedTo && assignedTo !== 'none' ? assignedTo : null),
          distributed_at: (isOP || (canAssign && assignedTo && assignedTo !== 'none')) ? new Date().toISOString() : null,
          status_carga: (isOP || (canAssign && assignedTo && assignedTo !== 'none')) ? 'RECEBIDO' : 'AGUARDANDO_DISTRIBUICAO',
          confirmed_at: (isOP || (canAssign && assignedTo && assignedTo !== 'none')) ? new Date().toISOString() : null,
          setor: profile?.setor || null,
          uf: uf || null,
          modo_sesau: isNotaModoSesau({ emissor: finalEmissor }),
          demanda_judicial: demandaJudicial
        }], user)
        if (error) throw error
        notaId = nota?.id || null
      }

      // SALVAR ITENS EXTRAÍDOS
      if (notaId && itensIA.length > 0) {
          let itensAtaVincular: Tables<'itens_ata'>[] = []
          let itensContratoVincular: Tables<'itens_contrato'>[] = []
          
          const finalAtaId = (selectedAtaId && selectedAtaId !== 'none') 
              ? selectedAtaId 
              : (selectedContratoId && selectedContratoId !== 'none' 
                  ? contratos.find(c => c.id === selectedContratoId)?.ata_id 
                  : null)

          if (finalAtaId) {
              const { data } = await supabase.from('itens_ata')
                .select('*')
                .eq('ata_id', finalAtaId)
              itensAtaVincular = data || []
          }

          if (selectedContratoId && selectedContratoId !== 'none') {
              const { data } = await supabase.from('itens_contrato')
                .select('*')
                .eq('contrato_id', selectedContratoId)
              itensContratoVincular = data || []
          }

          const rowsToInsert = (itensIA || []).map(it => {
              // Match item de contrato
              const itemContratoCorrespondente = (itensContratoVincular || []).find(
                  ic => (ic.numero_item && String(ic.numero_item) === it.codigo_mapeamento_ia) ||
                        (it.codigo_mapeamento_ia && ic.descricao.toLowerCase().includes(it.codigo_mapeamento_ia.toLowerCase()))
              ) || (itensContratoVincular || []).find(
                  ic => ic.descricao.toLowerCase().includes(it.descricao.toLowerCase()) || 
                        it.descricao.toLowerCase().includes(ic.descricao.toLowerCase())
              )

              // Se tiver correspondente no contrato, usa o item_ata_id dele, senão faz match direto na ATA (código ou descrição)
              const itemAtaCorrespondente = itemContratoCorrespondente?.item_ata_id
                  ? (itensAtaVincular || []).find(ia => ia.id === itemContratoCorrespondente.item_ata_id)
                  : ((itensAtaVincular || []).find(
                      ia => ia.mapeamento_ia === it.codigo_mapeamento_ia && it.codigo_mapeamento_ia
                    ) || (itensAtaVincular || []).find(
                      ia => (ia.descricao || '').trim().toLowerCase() === (it.descricao || '').trim().toLowerCase()
                    ) || (itensAtaVincular || []).find(
                      ia => (ia.descricao || '').toLowerCase().includes((it.descricao || '').toLowerCase()) ||
                            (it.descricao || '').toLowerCase().includes((ia.descricao || '').toLowerCase())
                    ))
              
              const rawQty = it.quantidade;
              const qtyNum = Number(rawQty) || 0;
              const isNotInt = !Number.isInteger(qtyNum);
              const finalQty = isNotInt ? Math.floor(qtyNum) : qtyNum;
              const finalDesc = isNotInt 
                ? `${it.descricao} (${rawQty} - quantidade original não é um número inteiro)` 
                : it.descricao;

              return {
                nota_id: notaId,
                descricao: finalDesc,
                quantidade: finalQty,
                unidade: it.unidade,
                valor_unitario: it.valor_unitario,
                marca: it.marca || null,
                lote: it.lote || null,
                codigo_item: it.codigo || it.codigo_item || null,
                categoria: it.categoria || 'INSUMO',
                mapeamento_ia: it.codigo_mapeamento_ia || null,
                item_ata_id: itemAtaCorrespondente?.id || null,
                item_contrato_id: itemContratoCorrespondente?.id || null,
                status_item: 'EM_ESTOQUE',
                produto_catalogo_id: it.produto_catalogo_id || null
              }
          })
          const { error: errorItens } = await supabase.from('itens').insert(rowsToInsert)
          if (errorItens) {
            console.error('Erro ao salvar itens:', errorItens)
            toast.error(`O documento foi criado, mas houve um erro ao salvar os itens: ${errorItens.message}`)
            return // Interrompe
          } else if (finalAtaId) {
            // ABATIMENTO DE SALDO NA ATA
            console.log(`[Ata Abatimento] Iniciando abatimento para ${rowsToInsert.length} itens vinculados à Ata ${finalAtaId}`)
            for (const row of rowsToInsert) {
              if (row.item_ata_id) {
                const { error: errAbatimento } = await supabase.rpc('incrementar_abatimento_ata', {
                  target_item_ata_id: row.item_ata_id as number,
                  qtd: row.quantidade as number
                })
                if (errAbatimento) console.error(`[Ata Abatimento] Erro ao abater item ${row.item_ata_id}:`, errAbatimento)
              }
            }
          }
      }

      setShowSuccessModal(true)
      toast.success('Salvo com sucesso!')
      
      // Limpar cache local e estados após sucesso
      resetForm()
      
      // Atualizar lista de entidades para o próximo cadastro
      loadInitialData()
      
      if (aoSalvar) aoSalvar()
    } catch (err) {
      console.error('[Supabase Error]', err)
      const supaErr = err as any
      let message = supaErr?.message || (err instanceof Error ? err.message : String(err))
      const detail = supaErr?.details || supaErr?.hint || ''

      // Tradução de Erros Comuns de Banco
      if (message.includes('unique_numero_ne_entidade') || supaErr?.code === '23505') {
        message = "Este número de empenho já está cadastrado para este órgão."
      }

      toast.error(`Erro ao salvar: ${message}${detail ? ` — ${detail}` : ''}`)
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
                <CardTitle>Importação Inteligente de Empenho / OC</CardTitle>
                <p className="text-xs text-zinc-500 font-normal">Use a IA para extrair dados e vincular saldos automaticamente</p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-8">
          <div 
            className={`p-6 rounded-xl border-2 border-dashed transition-all relative overflow-hidden space-y-4 ${
              isDragging 
                ? 'border-brand-accent bg-brand-accent/20' 
                : 'border-brand-accent/20 bg-brand-accent/5'
            }`}>
            
            {/* Camada de Captura (Overlay) para evitar flickering com elementos filhos */}
            {isDragging && <div className="absolute inset-0 z-50 pointer-events-none bg-transparent" />}

            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDragging ? 'bg-brand-accent text-primary-foreground animate-bounce' : 'bg-brand-muted/30 text-brand-accent'}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold block">Importação Inteligente</span>
                  <span className="text-xs text-zinc-500">Arraste seu PDF aqui ou use o botão ao lado</span>
                </div>
              </div>
              <Label htmlFor="file-upload" className="bg-brand-accent hover:opacity-90 text-primary-foreground px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 transition-shadow hover:shadow-lg shadow-brand-accent/20">
                {loadingIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loadingIA ? 'Lendo...' : 'Selecionar Arquivo'}
                <input id="file-upload" type="file" className="hidden" accept="application/pdf,image/*" onChange={handleArquivoIA} disabled={loadingIA} />
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
                               if (ent.estado) {
                                 setUf(ent.estado)
                               }
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

                     <div className="mt-4">
                        <Label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block tracking-wider">Estado (UF) do Documento</Label>
                        <Select value={uf} onValueChange={setUf}>
                            <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850 h-9">
                                <SelectValue placeholder="Selecione a UF..." />
                            </SelectTrigger>
                            <SelectContent>
                                {BR_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                     </div>

                     {canAssign && (
                        <div className="mt-4">
                          <Label className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400 mb-1 block tracking-wider">
                            Atribuição de Responsável (Carga)
                          </Label>
                          <Select value={assignedTo} onValueChange={setAssignedTo}>
                            <SelectTrigger className="bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/50">
                              <SelectValue placeholder="Vendedor responsável" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-zinc-500 italic">Deixar sem atribuição</SelectItem>
                              {users.map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.display_name || u.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                     )}
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Documento</Label>
                  <Select value={tipoDoc} onValueChange={setTipoDoc}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NOTA DE EMPENHO">Nota de Empenho</SelectItem>
                      <SelectItem value="ORDEM DE COMPRA">Ordem de Compra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {tipoDoc !== 'ATA DE REGISTRO DE PREÇOS' && (
                  <div className="space-y-4 p-4 bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    {/* Vincular Contrato */}
                    <div className="space-y-2">
                      <Label className="text-brand-accent font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 mb-1">
                        <FileText size={14} /> Vincular a um Contrato (Opcional)
                      </Label>
                      <Select 
                        value={selectedContratoId} 
                        onValueChange={(val) => {
                          setSelectedContratoId(val)
                          if (val && val !== 'none') {
                            const c = contratos.find(x => x.id === val)
                            if (c?.ata_id) {
                              setSelectedAtaId(c.ata_id)
                            }
                          } else {
                            setSelectedContratoId('')
                          }
                        }}
                      >
                        <SelectTrigger className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                          <SelectValue placeholder="Selecione um Contrato (Opcional)" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          <SelectItem value="none">-- Sem contrato --</SelectItem>
                          {contratos.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              Contrato nº {c.numero_contrato} {c.ata?.numero_arp ? `(ATA: ${c.ata.numero_arp})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Vincular ATA */}
                    <div className="space-y-2">
                      <Label className="text-blue-700 dark:text-blue-400 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 mb-1">
                        <PackageCheck size={14} /> Vincular a uma Ata (ARP)
                      </Label>
                      <Select 
                        value={selectedAtaId} 
                        onValueChange={setSelectedAtaId}
                        disabled={!!selectedContratoId && selectedContratoId !== 'none'}
                      >
                        <SelectTrigger className="bg-white dark:bg-zinc-950 border-blue-200 dark:border-blue-900/50">
                          <SelectValue placeholder="Selecione uma Ata (Opcional)" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          <div className="p-2 sticky top-0 bg-white dark:bg-zinc-950 z-10 border-b border-zinc-100 dark:border-zinc-800">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                              <Input 
                                placeholder="Filtrar ATAs..." 
                                value={searchAta}
                                onChange={e => setSearchAta(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="h-8 pl-7 text-xs"
                              />
                            </div>
                          </div>
                          <SelectItem value="none">-- Sem vínculo --</SelectItem>
                          {filteredAtas.length === 0 ? (
                            <div className="p-4 text-center text-xs text-zinc-400 italic">
                              Nenhuma ATA encontrada
                            </div>
                          ) : (
                            filteredAtas.map(ata => (
                              <SelectItem key={ata.id} value={String(ata.id)}>
                                {ata.numero_arp} - {ata.entidade_gerenciadora}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">Ao vincular a um contrato ou ata, o sistema mapeará os itens e fará o abatimento do saldo correspondente.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Número da Nota (NE/OC)</Label>
                  <Input value={numeroNe} onChange={e => setNumeroNe(e.target.value)} />
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Valor Total (R$)</Label>
                  <Input type="number" value={valorTeto} onChange={e => setValorTeto(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data Emissão</Label>
                  <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Prazo de Entrega (em dias)</Label>
                  <Input 
                    type="number"
                    value={prazoDias} 
                    onChange={(e) => setPrazoDias(e.target.value)} 
                    placeholder="Ex: 15"
                  />
                  {dataEmissao && (
                    <p className="text-[10px] text-zinc-400 font-medium italic">
                      Entrega calculada: {(() => {
                        const d = new Date(dataEmissao)
                        d.setDate(d.getDate() + (Number(prazoDias) || 0))
                        return d.toLocaleDateString('pt-BR')
                      })()}
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-2 pt-1.5 select-none">
                  <input
                    type="checkbox"
                    id="demanda_judicial_empenho"
                    checked={demandaJudicial}
                    onChange={(e) => setDemandaJudicial(e.target.checked)}
                    className="rounded border-zinc-300 text-brand-accent focus:ring-brand-accent h-4 w-4"
                  />
                  <Label htmlFor="demanda_judicial_empenho" className="text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer uppercase tracking-wider flex items-center gap-1">
                    ⚖️ Demanda Judicial
                  </Label>
                </div>
              </div>
            </div>

            {(itensIA || []).length > 0 && (
              <div className="border rounded-xl overflow-visible">
                <Table>
                  <TableHeader className="bg-zinc-50 dark:bg-zinc-900 sticky top-0">
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Und</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">V. Unit</TableHead>
                      <TableHead className="text-right text-brand-accent">V. Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(itensIA || []).map((it, i) => (
                      <TableRow key={i}>
                        <TableCell className="p-2 py-3 min-w-[320px] relative overflow-visible">
                          <ProductAutocomplete
                            defaultValue={it.descricao}
                            onChange={(val) => {
                              const novaLista = [...itensIA]
                              novaLista[i].descricao = val
                              novaLista[i].produto_catalogo_id = null
                              setItensIA(novaLista)
                            }}
                            onSelect={(product) => {
                              const novaLista = [...itensIA]
                              novaLista[i].descricao = product.descricao_completa
                              novaLista[i].unidade = product.unidade_venda || it.unidade
                              novaLista[i].produto_catalogo_id = product.id
                              
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
                              
                              novaLista[i].categoria = cat
                              setItensIA(novaLista)
                            }}
                            placeholder="Buscar no catálogo ou digitar..."
                            inputClassName="h-8 text-[11px] font-medium"
                          />
                        </TableCell>
                        <TableCell>
                            <Select 
                                value={it.categoria} 
                                onValueChange={(val) => {
                                    const novaLista = [...itensIA]
                                    novaLista[i].categoria = val
                                    setItensIA(novaLista)
                                }}
                            >
                                <SelectTrigger className="h-7 text-[10px] w-32 border-none bg-brand-accent/10 hover:bg-brand-accent/20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORIAS_OPCOES.map(opt => (
                                        <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </TableCell>
                        <TableCell className="text-zinc-500">{it.marca || '-'}</TableCell>
                        <TableCell className="font-bold text-brand-accent">{it.unidade}</TableCell>
                        <TableCell className="text-right">{it.quantidade}</TableCell>
                        <TableCell className="text-right">{formatCurrency(it.valor_unitario)}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(it.valor_total || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-6 border-t font-semibold">
              <Button type="button" variant="outline" onClick={resetForm}>Limpar Tudo</Button>
              <Button onClick={handleSalvar} disabled={loading || !numeroNe} className="bg-brand-accent hover:opacity-90 text-primary-foreground px-8 h-10 font-bold shadow-lg shadow-brand-accent/20">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                CONFIRMAR CADASTRO
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader className="items-center">
            <PackageCheck className="w-12 h-12 text-emerald-500 mb-2" />
            <DialogTitle>Documento Cadastrado!</DialogTitle>
            <DialogDescription>Escolha o próximo passo:</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 mt-4">
            <Button className="bg-emerald-600 hover:bg-emerald-700 h-12 text-white font-bold" onClick={() => { setShowSuccessModal(false); navigate('/empenhos'); }}>
                📦 Ir para Módulo Logística
            </Button>
            <Button variant="outline" className="h-12 font-medium" onClick={() => { setShowSuccessModal(false); resetForm(); }}>
                ➕ Novo Cadastro
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              const isAllowed = file.type === 'application/pdf' || 
                                file.name.toLowerCase().endsWith('.pdf') || 
                                file.type.startsWith('image/') || 
                                /\.(png|jpe?g)$/i.test(file.name);
              if (isAllowed) {
                const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                handleArquivoIA(fakeEvent);
              } else {
                toast.error('Por favor, envie arquivos PDF ou Imagens (PNG, JPG).');
              }
            }
          }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950/65 backdrop-blur-md border-4 border-dashed border-brand-accent m-4 rounded-2xl animate-in fade-in zoom-in duration-200"
        >
          <div className="pointer-events-none bg-zinc-900/90 border border-zinc-800 p-8 rounded-2xl max-w-md w-full mx-4 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="mx-auto w-20 h-20 bg-brand-accent/15 border-2 border-brand-accent/30 rounded-full flex items-center justify-center text-brand-accent animate-pulse">
              <Sparkles className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-tight">Importação Inteligente de Empenho</h3>
              <p className="text-sm text-zinc-400">
                Solte o documento de Empenho ou Ordem de Compra (PDF ou Imagem) em qualquer lugar da tela para que a IA realize o processamento tabular
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-accent/10 border border-brand-accent/25 text-xs font-semibold text-brand-accent tracking-wide uppercase">
              <Upload className="w-3.5 h-3.5" /> Apenas arquivos PDF
            </div>
          </div>
        </div>
      )}
    </div>
  )
}