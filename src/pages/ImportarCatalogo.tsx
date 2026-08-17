import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { toast } from 'sonner'
import { 
  Upload, 
  FileSpreadsheet, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  ShieldAlert, 
  RefreshCw, 
  Trash2,
  Database
} from 'lucide-react'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
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
  SelectValue,
} from "../components/ui/select"

interface ParsedData {
  headers: string[]
  rows: Record<string, string>[]
}

export function ImportarCatalogo() {
  const { profile } = useAuth()
  const [catalogCount, setCatalogCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedData>({ headers: [], rows: [] })
  
  // Mappings for the selected 9 columns
  const [mappings, setMappings] = useState({
    codigo_interno: '',
    descricao_completa: '',
    descricao_resumida: 'NONE',
    unidade_venda: 'NONE',
    unidade_compra: 'NONE',
    marca: 'NONE',
    fabricante: 'NONE',
    grupo: 'NONE',
    classe: 'NONE'
  })
  
  const [clearBeforeImport, setClearBeforeImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)

  // Fetch current items count
  const fetchCatalogCount = async () => {
    setLoadingCount(true)
    try {
      const { count, error } = await supabase
        .from('catalogo_produtos')
        .select('*', { count: 'exact', head: true })
      
      if (error) throw error
      setCatalogCount(count || 0)
    } catch (err: any) {
      console.error('Error fetching catalog count:', err.message)
      toast.error('Erro ao ler total de itens cadastrados.')
    } finally {
      setLoadingCount(false)
    }
  }

  useEffect(() => {
    if (profile?.nivel === 'DEV') {
      fetchCatalogCount()
    }
  }, [profile])

  if (profile?.nivel !== 'DEV') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
        <ShieldAlert className="w-16 h-16 text-red-500 animate-bounce" />
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Acesso Restrito</h2>
        <p className="text-zinc-500 text-sm max-w-md">
          Esta página é exclusiva para desenvolvedores do sistema (nível DEV). 
          Se você acha que isso é um erro, consulte a direção.
        </p>
      </div>
    )
  }

  // Detect CSV delimiter (semicolon or comma)
  const detectSeparator = (headerLine: string) => {
    const semicolons = (headerLine.match(/;/g) || []).length
    const commas = (headerLine.match(/,/g) || []).length
    return semicolons > commas ? ';' : ','
  }

  // Basic CSV parser that handles quotes
  const parseCSVText = (text: string): ParsedData => {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
    if (lines.length === 0) return { headers: [], rows: [] }

    const separator = detectSeparator(lines[0])
    
    const parseLine = (line: string) => {
      const result = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === separator && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseLine(lines[0]).map(h => h.replace(/['"]+/g, '').trim()).filter(h => h.length > 0)
    const rows = lines.slice(1).map(line => {
      const values = parseLine(line)
      const rowData: Record<string, string> = {}
      headers.forEach((header, idx) => {
        rowData[header] = values[idx]?.replace(/['"]+/g, '').trim() || ''
      })
      return rowData
    })

    return { headers, rows }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const parsed = parseCSVText(text)
      setParsedData(parsed)

      // Try automatic fuzzy mapping
      const headers = parsed.headers
      const lowercaseHeaders = headers.map(h => h.toLowerCase())

      const findMatch = (keys: string[]) => {
        const idx = lowercaseHeaders.findIndex(lh => keys.some(k => lh.includes(k)))
        return idx !== -1 ? headers[idx] : ''
      }

      setMappings({
        codigo_interno: findMatch(['codigo', 'id', 'sku', 'ref']),
        descricao_completa: findMatch(['completa', 'descricao completa', 'descricao']),
        descricao_resumida: findMatch(['resumida', 'descricao resumida', 'exibicao']) || 'NONE',
        unidade_venda: findMatch(['unidade venda', 'unid. venda', 'unid venda', 'unidade de venda', 'venda']) || 'NONE',
        unidade_compra: findMatch(['unidade compra', 'unid. compra', 'unid compra', 'unidade de compra', 'compra']) || 'NONE',
        marca: findMatch(['marca']) || 'NONE',
        fabricante: findMatch(['fabricante', 'fabr']) || 'NONE',
        grupo: findMatch(['grupo', 'categoria']) || 'NONE',
        classe: findMatch(['classe', 'subgrupo']) || 'NONE'
      })
    }
    reader.readAsText(selectedFile, 'UTF-8')
  }

  const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    const result: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size))
    }
    return result
  }

  const handleImport = async () => {
    if (!mappings.codigo_interno || !mappings.descricao_completa) {
      toast.error('É necessário mapear pelo menos Código e Descrição Completa.')
      return
    }

    setImporting(true)
    setProgress(0)

    try {
      // Map and clean records
      const records = parsedData.rows
        .map(row => {
          const cod = String(row[mappings.codigo_interno] || '').trim()
          const descComp = String(row[mappings.descricao_completa] || '').trim()

          const descRes = mappings.descricao_resumida !== 'NONE' ? String(row[mappings.descricao_resumida] || '').trim() : null
          const uniVenda = mappings.unidade_venda !== 'NONE' ? String(row[mappings.unidade_venda] || '').trim() : null
          const uniCompra = mappings.unidade_compra !== 'NONE' ? String(row[mappings.unidade_compra] || '').trim() : null
          const marca = mappings.marca !== 'NONE' ? String(row[mappings.marca] || '').trim() : null
          const fab = mappings.fabricante !== 'NONE' ? String(row[mappings.fabricante] || '').trim() : null
          const grupo = mappings.grupo !== 'NONE' ? String(row[mappings.grupo] || '').trim() : null
          const classe = mappings.classe !== 'NONE' ? String(row[mappings.classe] || '').trim() : null

          return {
            codigo_interno: cod,
            descricao_completa: descComp,
            descricao_resumida: descRes,
            unidade_venda: uniVenda,
            unidade_compra: uniCompra,
            marca,
            fabricante: fab,
            grupo,
            classe
          }
        })
        .filter(r => r.codigo_interno.length > 0 && r.descricao_completa.length > 0)

      // Deduplica os registros por codigo_interno na mesma transação/lote de envio
      const uniqueRecordsMap = new Map<string, any>()
      records.forEach(r => {
        uniqueRecordsMap.set(r.codigo_interno, r)
      })
      const uniqueRecords = Array.from(uniqueRecordsMap.values())

      if (uniqueRecords.length === 0) {
        throw new Error('Nenhum registro com código e descrição completos preenchidos foi encontrado no arquivo.')
      }

      // 1. Opcional: Limpar catálogo existente
      if (clearBeforeImport) {
        console.log('[Import] Limpando catálogo existente...')
        const { error: deleteError } = await supabase
          .from('catalogo_produtos')
          .delete()
          .neq('id', 0)
        
        if (deleteError) throw deleteError
      }

      // 2. Inserir em chunks de 500
      const chunks = chunkArray(uniqueRecords, 500)
      let insertedCount = 0

      console.log(`[Import] Processando ${chunks.length} blocos para ${uniqueRecords.length} itens únicos (de ${records.length} totais)...`)

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const { error } = await supabase
          .from('catalogo_produtos')
          .upsert(chunk, { onConflict: 'codigo_interno' })

        if (error) throw error

        insertedCount += chunk.length
        setProgress(Math.round(((i + 1) / chunks.length) * 100))
      }

      toast.success(`${insertedCount} itens do catálogo foram importados/atualizados com sucesso!`)
      
      // Reset state
      setFile(null)
      setParsedData({ headers: [], rows: [] })
      fetchCatalogCount()
    } catch (err: any) {
      console.error(err)
      toast.error(`Falha no processamento: ${err.message || err}`)
    } finally {
      setImporting(false)
    }
  }

  const handleClearCatalog = async () => {
    if (!window.confirm('ATENÇÃO: Isso apagará TODOS os itens cadastrados no catálogo padrão. Deseja prosseguir?')) {
      return
    }

    setLoadingCount(true)
    try {
      const { error } = await supabase
        .from('catalogo_produtos')
        .delete()
        .neq('id', 0)

      if (error) throw error
      toast.success('Catálogo limpo com sucesso!')
      fetchCatalogCount()
    } catch (err: any) {
      toast.error(`Erro ao limpar catálogo: ${err.message}`)
    } finally {
      setLoadingCount(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Database className="w-7 h-7 text-brand-accent" />
            Importar Catálogo de Estoque
          </h1>
          <p className="text-zinc-500 text-sm">
            Módulo restrito de sincronização e padronização da base de itens (Modo DEV ativo).
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchCatalogCount} 
          disabled={loadingCount}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loadingCount ? 'animate-spin' : ''}`} />
          Atualizar Contagem
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Contagem */}
        <Card className="p-5 flex flex-col justify-between border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900">
          <div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Itens no Catálogo</span>
            <div className="text-3xl font-black text-brand-accent mt-2">
              {loadingCount ? (
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
              ) : (
                catalogCount?.toLocaleString('pt-BR')
              )}
            </div>
            <p className="text-zinc-400 text-xs mt-2 leading-relaxed">
              Total de itens disponíveis para autocompletar no Módulo de Compras e cadastros.
            </p>
          </div>
          {catalogCount !== null && catalogCount > 0 && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleClearCatalog} 
              disabled={loadingCount}
              className="mt-4 w-full gap-2 text-xs"
            >
              <Trash2 className="w-4 h-4" />
              Limpar Todo o Catálogo
            </Button>
          )}
        </Card>

        {/* Card Seletor de Arquivos */}
        <Card className="md:col-span-2 p-5 border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4 text-brand-accent" />
              Enviar Arquivo de Sincronização (.CSV)
            </h2>
            <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-all relative">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={importing}
              />
              <FileSpreadsheet className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {file ? file.name : 'Selecione ou arraste seu arquivo CSV'}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Codificação sugerida: UTF-8. Separador: Vírgula (,) ou Ponto e Vírgula (;)'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {parsedData.rows.length > 0 && (
        <Card className="p-6 border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900 space-y-6">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Mapeamento de Colunas</h2>
            <p className="text-xs text-zinc-400">Identifique as colunas do seu CSV correspondentes aos campos da base do Nexus.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-2">
            
            {/* Bloco 1: Identificadores principais */}
            <div className="space-y-4 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <h3 className="text-xs font-bold text-brand-accent uppercase tracking-wider">Identificadores Principais</h3>
              
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-zinc-500 uppercase">Código do Item (Único) *</Label>
                <Select 
                  value={mappings.codigo_interno} 
                  onValueChange={(val) => setMappings(m => ({ ...m, codigo_interno: val }))}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {parsedData.headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-zinc-500 uppercase">Descrição Completa *</Label>
                <Select 
                  value={mappings.descricao_completa} 
                  onValueChange={(val) => setMappings(m => ({ ...m, descricao_completa: val }))}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {parsedData.headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-zinc-500 uppercase">Descrição Resumida</Label>
                <Select 
                  value={mappings.descricao_resumida} 
                  onValueChange={(val) => setMappings(m => ({ ...m, descricao_resumida: val }))}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">-- Padrão (Vazio) --</SelectItem>
                    {parsedData.headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bloco 2: Especificações Físicas / Comerciais */}
            <div className="space-y-4 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Apresentação e Marca</h3>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-zinc-500 uppercase">Unidade de Venda</Label>
                <Select 
                  value={mappings.unidade_venda} 
                  onValueChange={(val) => setMappings(m => ({ ...m, unidade_venda: val }))}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">-- Padrão (UN) --</SelectItem>
                    {parsedData.headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-zinc-500 uppercase">Unidade de Compra</Label>
                <Select 
                  value={mappings.unidade_compra} 
                  onValueChange={(val) => setMappings(m => ({ ...m, unidade_compra: val }))}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">-- Padrão (Vazio) --</SelectItem>
                    {parsedData.headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-zinc-500 uppercase">Marca</Label>
                  <Select 
                    value={mappings.marca} 
                    onValueChange={(val) => setMappings(m => ({ ...m, marca: val }))}
                  >
                    <SelectTrigger className="h-9 text-[10px] font-semibold bg-white dark:bg-zinc-950">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">-- Vazio --</SelectItem>
                      {parsedData.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-zinc-500 uppercase">Fabricante</Label>
                  <Select 
                    value={mappings.fabricante} 
                    onValueChange={(val) => setMappings(m => ({ ...m, fabricante: val }))}
                  >
                    <SelectTrigger className="h-9 text-[10px] font-semibold bg-white dark:bg-zinc-950">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">-- Vazio --</SelectItem>
                      {parsedData.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Bloco 3: Categorização */}
            <div className="space-y-4 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <h3 className="text-xs font-bold text-violet-600 uppercase tracking-wider">Agrupamentos</h3>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-zinc-500 uppercase">Grupo (Categoria Principal)</Label>
                <Select 
                  value={mappings.grupo} 
                  onValueChange={(val) => setMappings(m => ({ ...m, grupo: val }))}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">-- Padrão (ESTOQUE) --</SelectItem>
                    {parsedData.headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-zinc-500 uppercase">Classe (Subgrupo)</Label>
                <Select 
                  value={mappings.classe} 
                  onValueChange={(val) => setMappings(m => ({ ...m, classe: val }))}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold bg-white dark:bg-zinc-950">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">-- Padrão (Vazio) --</SelectItem>
                    {parsedData.headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

          </div>

          {/* Pré-visualização */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-zinc-500 uppercase">Pré-visualização da Importação (Primeiras 3 Linhas)</Label>
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold text-zinc-400">CÓDIGO</TableHead>
                    <TableHead className="text-[10px] font-bold text-zinc-400">DESCRIÇÃO COMPLETA</TableHead>
                    <TableHead className="text-[10px] font-bold text-zinc-400">UND. VENDA</TableHead>
                    <TableHead className="text-[10px] font-bold text-zinc-400">UND. COMPRA</TableHead>
                    <TableHead className="text-[10px] font-bold text-zinc-400">MARCA / FABRICANTE</TableHead>
                    <TableHead className="text-[10px] font-bold text-zinc-400">GRUPO / CLASSE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.rows.slice(0, 3).map((row, idx) => (
                    <TableRow key={idx} className="hover:bg-transparent text-xs">
                      <TableCell className="font-mono font-bold text-brand-accent">
                        {mappings.codigo_interno ? row[mappings.codigo_interno] : <span className="text-red-500 font-normal italic">Mapear</span>}
                      </TableCell>
                      <TableCell className="font-medium text-zinc-700 dark:text-zinc-300 max-w-xs truncate">
                        {mappings.descricao_completa ? row[mappings.descricao_completa] : <span className="text-red-500 font-normal italic">Mapear</span>}
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {mappings.unidade_venda && mappings.unidade_venda !== 'NONE' ? row[mappings.unidade_venda] || 'UN' : 'UN'}
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {mappings.unidade_compra && mappings.unidade_compra !== 'NONE' ? row[mappings.unidade_compra] || '-' : '-'}
                      </TableCell>
                      <TableCell className="text-zinc-500 max-w-[120px] truncate">
                        {mappings.marca && mappings.marca !== 'NONE' ? row[mappings.marca] || '-' : '-'} / {mappings.fabricante && mappings.fabricante !== 'NONE' ? row[mappings.fabricante] || '-' : '-'}
                      </TableCell>
                      <TableCell className="text-zinc-500 max-w-[120px] truncate">
                        {mappings.grupo && mappings.grupo !== 'NONE' ? row[mappings.grupo] || 'ESTOQUE' : 'ESTOQUE'} / {mappings.classe && mappings.classe !== 'NONE' ? row[mappings.classe] || '-' : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 select-none cursor-pointer">
              <input 
                type="checkbox" 
                id="clearBefore" 
                checked={clearBeforeImport}
                onChange={(e) => setClearBeforeImport(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 text-brand-accent focus:ring-brand-accent"
                disabled={importing}
              />
              <Label htmlFor="clearBefore" className="text-xs font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer">
                Apagar todos os itens existentes no catálogo antes de importar (Limpeza total)
              </Label>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button 
                variant="outline" 
                onClick={() => {
                  setFile(null)
                  setParsedData({ headers: [], rows: [] })
                }}
                disabled={importing}
                className="flex-1 sm:flex-none text-xs"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={importing || !mappings.codigo_interno || !mappings.descricao_completa}
                className="flex-1 sm:flex-none text-xs bg-brand-accent hover:bg-brand-accent/90 text-white gap-2 font-bold min-w-[150px]"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importando ({progress}%)
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Iniciar Importação ({parsedData.rows.length} itens)
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Informativo de Ajuda */}
      <Card className="p-4 border-amber-200 dark:border-amber-900/40 bg-amber-500/5 flex items-start gap-3 rounded-2xl">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Importante sobre Atualização Semanal/Quinzenal</h4>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Por padrão, a importação utiliza a operação de <strong>Upsert</strong> (inserção/atualização) baseada no campo <strong>Código do Item</strong>. 
            Isso significa que se um código de item já existir no catálogo, o Nexus apenas atualizará a sua descrição, unidade de medida e categoria para refletir a planilha do estoque, sem criar registros duplicados ou quebrar as dependências.
          </p>
        </div>
      </Card>
    </div>
  )
}
