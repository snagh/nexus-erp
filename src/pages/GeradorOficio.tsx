import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Printer, FileText, ChevronRight } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

interface ItemValidade {
  id: string
  nome: string
  qtd: string
  lote: string
  fab: string
  val: string
}

interface OrdemValidade {
  id: string
  tipoVinculo: string
  numVinculo: string
  itens: ItemValidade[]
}

interface ItemTroca {
  id: string
  nome: string
  qtd: string
  desc: string
  antiga: string
  nova: string
  anvisa: string
}

interface ItemCancelamento {
  id: string
  descricao: string
  qtdSolicitada: string
  embalagem: string
  qtdAtendida: string
}

interface ItemVariacao {
  id: string
  materiaPrima: string
  variacao: string
}

interface ItemDilacao {
  id: string
  numero: string
  descricao: string
  marca: string
}

interface ItemRecolhimento {
  id: string
  codigo: string
  descricao: string
  lote: string
  validade: string
  quantidade: string
  valor_unitario: string
  valor_total: string
}

interface ItemDoacao {
  id: string
  descricao: string
  marca: string
  quantidade: string
  valor_estimado: string
}

interface ItemDescritivo {
  id: string
  nome: string
  descOriginal: string
  descProposto: string
}


const getDataExtenso = () => {
  const data = new Date()
  const meses = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]
  const dia = String(data.getDate()).padStart(2, "0")
  return `${dia} de ${meses[data.getMonth()]} de ${data.getFullYear()}`
}

export function GeradorOficio() {
  const [tipoDoc, setTipoDoc] = useState('troca_marca')
  const [cliente, setCliente] = useState('')
  const [tipoVinculo1, setTipoVinculo1] = useState('empenho')
  const [numVinculo1, setNumVinculo1] = useState('')
  const [tipoVinculo2, setTipoVinculo2] = useState('processo')
  const [numVinculo2, setNumVinculo2] = useState('')
  const [empenhosVinculados, setEmpenhosVinculados] = useState('')
  const [nfe, setNfe] = useState('')
  const [recebimento, setRecebimento] = useState('')
  const [justificativaCancelamento, setJustificativaCancelamento] = useState('')
  const [justificativaDilacao, setJustificativaDilacao] = useState(`O cumprimento do prazo original de 10 dias corridos restou prejudicado por motivos de força maior e fatos do príncipe, alheios à vontade desta distribuidora. Conforme comunicado oficial do fabricante Medix Brasil (em anexo), o mercado global enfrenta uma severa restrição de matérias-primas e elevação logística decorrente do cenário geopolítico instável. 

Os principais pontos que impactam o fornecimento são:
•	Conflito Internacional: A instabilidade geopolítica (Guerra no Irã e Oriente Médio) provocou a elevação do preço do petróleo para US$ 103,32, impactando diretamente a cadeia petroquímica. 
•	Restrição de Matérias-Primas: Há uma escassez crítica de insumos essenciais para a produção de luvas nitrílicas, como o NBR Látex, que sofreu uma variação de +143% e o Butadiene com alta de +166%. 
•	Logística Internacional: O fabricante relata a triplicação dos custos de frete marítimo e redução da previsibilidade nas entregas internacionais.`)

  const [numContrato, setNumContrato] = useState('')
  const [numAta, setNumAta] = useState('')
  const [numOF, setNumOF] = useState('')
  const [prazoSolicitado, setPrazoSolicitado] = useState('30 (trinta)')

  const [itensDilacao, setItensDilacao] = useState<ItemDilacao[]>([
    { id: crypto.randomUUID(), numero: '12', descricao: 'Luva de segurança, material 100% borracha nitrílica, cor azul, descartável, tamanho Médio (M)', marca: 'MEDIX' },
    { id: crypto.randomUUID(), numero: '13', descricao: 'Luva de segurança, material 100% borracha nitrílica, cor azul, descartável, tamanho Grande (G)', marca: 'MEDIX' }
  ])

  const [itensCancelamento, setItensCancelamento] = useState<ItemCancelamento[]>([
    { id: crypto.randomUUID(), descricao: '', qtdSolicitada: '', embalagem: '', qtdAtendida: '' }
  ])

  const [ordensValidade, setOrdensValidade] = useState<OrdemValidade[]>([
    { 
      id: crypto.randomUUID(), 
      tipoVinculo: 'empenho', 
      numVinculo: '', 
      itens: [{ id: crypto.randomUUID(), nome: '', qtd: '', lote: '', fab: '', val: '' }] 
    }
  ])

  const [itensTroca, setItensTroca] = useState<ItemTroca[]>([
    { id: crypto.randomUUID(), nome: '', qtd: '', desc: '', antiga: '', nova: '', anvisa: '' }
  ])

  const [localData, setLocalData] = useState(`PALMAS - TO, ${getDataExtenso()}`)
  const [nomeIndustria, setNomeIndustria] = useState('MEDIX BRASIL')

  // --- Estado: Termo de Recolhimento ---
  const [recolhCnpj, setRecolhCnpj] = useState('')
  const [recolhRazaoSocial, setRecolhRazaoSocial] = useState('')
  const [recolhContato, setRecolhContato] = useState('')
  const [recolhMotivo, setRecolhMotivo] = useState('')
  const [recolhLocalData, setRecolhLocalData] = useState(`PALMAS - TO, ${getDataExtenso()}`)
  const [itensRecolhimento, setItensRecolhimento] = useState<ItemRecolhimento[]>([
    { id: crypto.randomUUID(), codigo: '', descricao: '', lote: '', validade: '', quantidade: '', valor_unitario: '', valor_total: '' }
  ])
  const [itensVariacao, setItensVariacao] = useState<ItemVariacao[]>([
    { id: crypto.randomUUID(), materiaPrima: 'PVC Paste', variacao: '+23%' },
    { id: crypto.randomUUID(), materiaPrima: 'DOTP', variacao: '+48%' },
    { id: crypto.randomUUID(), materiaPrima: 'Acrylonitrile', variacao: '+33%' },
    { id: crypto.randomUUID(), materiaPrima: 'NBR Látex', variacao: '+143%' },
    { id: crypto.randomUUID(), materiaPrima: 'Butadiene', variacao: '+166%' }
  ])

  // --- Estado: Termo de Doação ---
  const [doacaoTitulo, setDoacaoTitulo] = useState('TERMO DE DOAÇÃO DE AGULHAS')
  const [doacaoDonataria, setDoacaoDonataria] = useState('UNIVERSIDADE ESTADUAL DE CIÊNCIAS DA SAÚDE DE ALAGOAS – UNCISAL')
  const [doacaoDonatariaCnpj, setDoacaoDonatariaCnpj] = useState('00.000.000/0001-95')
  const [doacaoEndereco, setDoacaoEndereco] = useState('Rua Doutor Jorge Lima, nº 113, Bairro Trapiche da Barra, Maceió – AL, CEP: 57010-382')
  const [doacaoForo, setDoacaoForo] = useState('Maceió – AL')
  const [doacaoLocalData, setDoacaoLocalData] = useState(`PALMAS – TO, ${getDataExtenso()}.`)
  const [itensDoacao, setItensDoacao] = useState<ItemDoacao[]>([
    { id: crypto.randomUUID(), descricao: 'Agulhas hipodérmicas', marca: 'Wilter', quantidade: '100', valor_estimado: 'R$ 10,00' }
  ])

  const [justificativaDescritivo, setJustificativaDescritivo] = useState(
    'A alteração de descritivo apresentada faz-se necessária tendo em vista a indisponibilidade temporária de fabricação/comercialização do produto na embalagem/volume originalmente descrito no edital/empenho. Para garantir a continuidade do abastecimento e evitar prejuízos à assistência farmacêutica do Órgão, propomos a entrega do produto em embalagem/volume equivalente, mantendo-se rigorosamente a mesma quantidade total do princípio ativo, a mesma qualidade e o mesmo valor originalmente contratado, sem qualquer ônus adicional.'
  )
  const [itensDescritivo, setItensDescritivo] = useState<ItemDescritivo[]>([
    { id: crypto.randomUUID(), nome: 'DIPIRONA SÓDICA 500MG/ML SOL ORAL', descOriginal: 'FRASCO COM 10ML', descProposto: 'FRASCO COM 20ML (ENTREGA DA MESMA QUANTIDADE TOTAL EM MILILITROS)' }
  ])

  const [previewHtml, setPreviewHtml] = useState('')

  // --- PERSISTÊNCIA ---
  useEffect(() => {
    const savedData = localStorage.getItem('nexus_gerador_oficio')
    if (savedData) {
      try {
        const data = JSON.parse(savedData)
        if (data.tipoDoc) setTipoDoc(data.tipoDoc)
        if (data.cliente) setCliente(data.cliente)
        if (data.tipoVinculo1) setTipoVinculo1(data.tipoVinculo1)
        if (data.numVinculo1) setNumVinculo1(data.numVinculo1)
        if (data.tipoVinculo2) setTipoVinculo2(data.tipoVinculo2)
        if (data.numVinculo2) setNumVinculo2(data.numVinculo2)
        if (data.empenhosVinculados !== undefined) setEmpenhosVinculados(data.empenhosVinculados)
        if (data.nfe) setNfe(data.nfe)
        if (data.recebimento) setRecebimento(data.recebimento)
        if (data.justificativaCancelamento) setJustificativaCancelamento(data.justificativaCancelamento)
        if (data.justificativaDilacao) setJustificativaDilacao(data.justificativaDilacao)
        if (data.numContrato) setNumContrato(data.numContrato)
        if (data.numAta) setNumAta(data.numAta)
        if (data.numOF) setNumOF(data.numOF)
        if (data.prazoSolicitado) setPrazoSolicitado(data.prazoSolicitado)
        if (data.itensDilacao) setItensDilacao(data.itensDilacao)
        if (data.itensCancelamento) setItensCancelamento(data.itensCancelamento)
        if (data.ordensValidade) setOrdensValidade(data.ordensValidade)
        if (data.itensTroca) setItensTroca(data.itensTroca)
        if (data.localData) setLocalData(data.localData)
        if (data.nomeIndustria) setNomeIndustria(data.nomeIndustria)
        if (data.itensVariacao) setItensVariacao(data.itensVariacao)
        if (data.doacaoTitulo) setDoacaoTitulo(data.doacaoTitulo)
        if (data.doacaoDonataria) setDoacaoDonataria(data.doacaoDonataria)
        if (data.doacaoDonatariaCnpj) setDoacaoDonatariaCnpj(data.doacaoDonatariaCnpj)
        if (data.doacaoEndereco) setDoacaoEndereco(data.doacaoEndereco)
        if (data.doacaoForo) setDoacaoForo(data.doacaoForo)
        if (data.doacaoLocalData) setDoacaoLocalData(data.doacaoLocalData)
        if (data.itensDoacao) setItensDoacao(data.itensDoacao)
        if (data.justificativaDescritivo !== undefined) setJustificativaDescritivo(data.justificativaDescritivo)
        if (data.itensDescritivo) setItensDescritivo(data.itensDescritivo)
      } catch (e) {
        console.error("Erro ao carregar dados salvos", e)
      }
    }
  }, [])

  useEffect(() => {
    const dataToSave = {
      tipoDoc, cliente, tipoVinculo1, numVinculo1, tipoVinculo2, numVinculo2, empenhosVinculados,
      nfe, recebimento, justificativaCancelamento, itensCancelamento,
      ordensValidade, itensTroca, localData, nomeIndustria, itensVariacao,
      justificativaDilacao, numContrato, numAta, numOF, prazoSolicitado, itensDilacao,
      recolhCnpj, recolhRazaoSocial, recolhContato, recolhMotivo, recolhLocalData, itensRecolhimento,
      doacaoTitulo, doacaoDonataria, doacaoDonatariaCnpj, doacaoEndereco, doacaoForo, doacaoLocalData, itensDoacao,
      justificativaDescritivo, itensDescritivo
    }
    localStorage.setItem('nexus_gerador_oficio', JSON.stringify(dataToSave))
  }, [tipoDoc, cliente, tipoVinculo1, numVinculo1, tipoVinculo2, numVinculo2, empenhosVinculados, nfe, recebimento, itensCancelamento, justificativaCancelamento, ordensValidade, itensTroca, localData, nomeIndustria, itensVariacao, justificativaDilacao, numContrato, numAta, numOF, prazoSolicitado, itensDilacao, recolhCnpj, recolhRazaoSocial, recolhContato, recolhMotivo, recolhLocalData, itensRecolhimento, doacaoTitulo, doacaoDonataria, doacaoDonatariaCnpj, doacaoEndereco, doacaoForo, doacaoLocalData, itensDoacao, justificativaDescritivo, itensDescritivo])

  const limparCampos = () => {
    if (confirm("Deseja realmente limpar todos os campos do formulário?")) {
      setCliente('')
      setNumVinculo1('')
      setNumVinculo2('')
      setEmpenhosVinculados('')
      setNfe('')
      setRecebimento('')
      setJustificativaCancelamento('')
      setItensCancelamento([{ id: crypto.randomUUID(), descricao: '', qtdSolicitada: '', embalagem: '', qtdAtendida: '' }])
      setOrdensValidade([{ id: crypto.randomUUID(), tipoVinculo: 'empenho', numVinculo: '', itens: [{ id: crypto.randomUUID(), nome: '', qtd: '', lote: '', fab: '', val: '' }] }])
      setItensTroca([{ id: crypto.randomUUID(), nome: '', qtd: '', desc: '', antiga: '', nova: '', anvisa: '' }])
      setLocalData(`PALMAS - TO, ${getDataExtenso()}`)
      setNomeIndustria('MEDIX BRASIL')
      setItensVariacao([
        { id: crypto.randomUUID(), materiaPrima: 'PVC Paste', variacao: '+23%' },
        { id: crypto.randomUUID(), materiaPrima: 'DOTP', variacao: '+48%' },
        { id: crypto.randomUUID(), materiaPrima: 'Acrylonitrile', variacao: '+33%' },
        { id: crypto.randomUUID(), materiaPrima: 'NBR Látex', variacao: '+143%' },
        { id: crypto.randomUUID(), materiaPrima: 'Butadiene', variacao: '+166%' }
      ])
      setDoacaoTitulo('TERMO DE DOAÇÃO DE AGULHAS')
      setDoacaoDonataria('UNIVERSIDADE ESTADUAL DE CIÊNCIAS DA SAÚDE DE ALAGOAS – UNCISAL')
      setDoacaoDonatariaCnpj('00.000.000/0001-95')
      setDoacaoEndereco('Rua Doutor Jorge Lima, nº 113, Bairro Trapiche da Barra, Maceió – AL, CEP: 57010-382')
      setDoacaoForo('Maceió – AL')
      setDoacaoLocalData(`PALMAS – TO, ${getDataExtenso()}.`)
      setItensDoacao([{ id: crypto.randomUUID(), descricao: 'Agulhas hipodérmicas', marca: 'Wilter', quantidade: '100', valor_estimado: 'R$ 10,00' }])
      setJustificativaDescritivo('A alteração de descritivo apresentada faz-se necessária tendo em vista a indisponibilidade temporária de fabricação/comercialização do produto na embalagem/volume originalmente descrito no edital/empenho. Para garantir a continuidade do abastecimento e evitar prejuízos à assistência farmacêutica do Órgão, propomos a entrega do produto em embalagem/volume equivalente, mantendo-se rigorosamente a mesma quantidade total do princípio ativo, a mesma qualidade e o mesmo valor originalmente contratado, sem qualquer ônus adicional.')
      setItensDescritivo([{ id: crypto.randomUUID(), nome: 'DIPIRONA SÓDICA 500MG/ML SOL ORAL', descOriginal: 'FRASCO COM 10ML', descProposto: 'FRASCO COM 20ML (ENTREGA DA MESMA QUANTIDADE TOTAL EM MILILITROS)' }])
      localStorage.removeItem('nexus_gerador_oficio')
    }
  }

  const adicionarOrdemValidade = () => {
    setOrdensValidade([...ordensValidade, { 
      id: crypto.randomUUID(), 
      tipoVinculo: 'empenho', 
      numVinculo: '', 
      itens: [{ id: crypto.randomUUID(), nome: '', qtd: '', lote: '', fab: '', val: '' }] 
    }])
  }

  const removerOrdemValidade = (id: string) => {
    if (ordensValidade.length > 1) {
      setOrdensValidade(ordensValidade.filter(o => o.id !== id))
    }
  }

  const atualizarOrdemValidade = (id: string, field: keyof OrdemValidade, value: any) => {
    setOrdensValidade(ordensValidade.map(o => o.id === id ? { ...o, [field]: value } : o))
  }

  const adicionarItemValidade = (ordemId: string) => {
    setOrdensValidade(ordensValidade.map(o => 
      o.id === ordemId 
        ? { ...o, itens: [...o.itens, { id: crypto.randomUUID(), nome: '', qtd: '', lote: '', fab: '', val: '' }] }
        : o
    ))
  }

  const removerItemValidade = (ordemId: string, itemId: string) => {
    setOrdensValidade(ordensValidade.map(o => 
      o.id === ordemId 
        ? { ...o, itens: o.itens.filter(i => i.id !== itemId) }
        : o
    ))
  }

  const atualizarItemValidade = (ordemId: string, itemId: string, field: keyof ItemValidade, value: string) => {
    setOrdensValidade(ordensValidade.map(o => 
      o.id === ordemId 
        ? { ...o, itens: o.itens.map(i => i.id === itemId ? { ...i, [field]: value } : i) }
        : o
    ))
  }

  const adicionarItemTroca = () => {
    setItensTroca([...itensTroca, { id: crypto.randomUUID(), nome: '', qtd: '', desc: '', antiga: '', nova: '', anvisa: '' }])
  }

  const removerItemTroca = (id: string) => {
    setItensTroca(itensTroca.filter(i => i.id !== id))
  }

  const atualizarItemTroca = (id: string, field: keyof ItemTroca, value: string) => {
    setItensTroca(itensTroca.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  const adicionarItemDescritivo = () => {
    setItensDescritivo([...itensDescritivo, { id: crypto.randomUUID(), nome: '', descOriginal: '', descProposto: '' }])
  }

  const removerItemDescritivo = (id: string) => {
    setItensDescritivo(itensDescritivo.filter(i => i.id !== id))
  }

  const atualizarItemDescritivo = (id: string, field: keyof ItemDescritivo, value: string) => {
    setItensDescritivo(itensDescritivo.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  const adicionarItemCancelamento = () => {
    setItensCancelamento([...itensCancelamento, { id: crypto.randomUUID(), descricao: '', qtdSolicitada: '', embalagem: '', qtdAtendida: '' }])
  }

  const removerItemCancelamento = (id: string) => {
    setItensCancelamento(itensCancelamento.filter(i => i.id !== id))
  }

  const atualizarItemCancelamento = (id: string, field: keyof ItemCancelamento, value: string) => {
    setItensCancelamento(itensCancelamento.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  const adicionarItemVariacao = () => {
    setItensVariacao([...itensVariacao, { id: crypto.randomUUID(), materiaPrima: '', variacao: '' }])
  }

  const removerItemVariacao = (id: string) => {
    setItensVariacao(itensVariacao.filter(i => i.id !== id))
  }

  const atualizarItemVariacao = (id: string, field: keyof ItemVariacao, value: string) => {
    setItensVariacao(itensVariacao.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  const adicionarItemDilacao = () => {
    setItensDilacao([...itensDilacao, { id: crypto.randomUUID(), numero: '', descricao: '', marca: '' }])
  }

  const removerItemDilacao = (id: string) => {
    setItensDilacao(itensDilacao.filter(i => i.id !== id))
  }

  const atualizarItemDilacao = (id: string, field: keyof ItemDilacao, value: string) => {
    setItensDilacao(itensDilacao.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  // --- Helpers: Termo de Recolhimento ---
  const adicionarItemRecolhimento = () => {
    setItensRecolhimento([...itensRecolhimento, { id: crypto.randomUUID(), codigo: '', descricao: '', lote: '', validade: '', quantidade: '', valor_unitario: '', valor_total: '' }])
  }
  const removerItemRecolhimento = (id: string) => {
    setItensRecolhimento(itensRecolhimento.filter(i => i.id !== id))
  }
  const atualizarItemRecolhimento = (id: string, field: keyof ItemRecolhimento, value: string) => {
    setItensRecolhimento(itensRecolhimento.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  // --- Helpers: Termo de Doação ---
  const adicionarItemDoacao = () => {
    setItensDoacao([...itensDoacao, { id: crypto.randomUUID(), descricao: '', marca: '', quantidade: '', valor_estimado: '' }])
  }
  const removerItemDoacao = (id: string) => {
    if (itensDoacao.length > 1) {
      setItensDoacao(itensDoacao.filter(i => i.id !== id))
    }
  }
  const atualizarItemDoacao = (id: string, field: keyof ItemDoacao, value: string) => {
    setItensDoacao(itensDoacao.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  const obterPreposicaoAo = (tipo: string) => {
    const femininos = ['nota_empenho', 'ordem_compra', 'arp', 'ordem_fornecimento', 'autorizacao_fornecimento']
    return femininos.includes(tipo) ? 'à' : 'ao'
  }

  const formatarNomeVinculo = (tipo: string) => {
    const nomes: Record<string, string> = {
      'empenho': 'Empenho',
      'nota_empenho': 'Nota de Empenho',
      'ordem_compra': 'Ordem de Compra',
      'memorando': 'Memorando',
      'pregao_eletronico': 'Pregão Eletrônico',
      'pregao_presencial': 'Pregão Presencial',
      'arp': 'Ata de Registro de Preços',
      'ordem_fornecimento': 'Ordem de Fornecimento',
      'autorizacao_fornecimento': 'Autorização de Fornecimento',
      'processo_licitatorio': 'Processo Licitatório',
      'processo_aquisicao': 'Processo de Aquisição',
      'processo': 'Processo'
    }
    return nomes[tipo] || 'Documento'
  }

  const formatarNegritoMarkdown = (texto: string) => {
    if (!texto) return '';
    return texto
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/__(.*?)__/g, '<b>$1</b>');
  }

  const gerarDocumento = () => {
    const fmt = (val: string) => formatarNegritoMarkdown(val);
    const cli = fmt(cliente.toUpperCase()) || "SECRETARIA DE ESTADO DA SAÚDE DO TOCANTINS – SES/TO"
    const nomeV1 = formatarNomeVinculo(tipoVinculo1).toUpperCase()
    const nomeV2 = formatarNomeVinculo(tipoVinculo2).toUpperCase()
    const valV1 = fmt(numVinculo1.toUpperCase()) || `[N° ${nomeV1}]`
    const valV2 = fmt(numVinculo2.toUpperCase())
    const dataExtensa = getDataExtenso()
    const prepAoV1 = obterPreposicaoAo(tipoVinculo1)
    const prepAoV2 = obterPreposicaoAo(tipoVinculo2)

    const strProcesso = valV2 ? `, vinculado ${prepAoV2} ${formatarNomeVinculo(tipoVinculo2)} nº <b>${valV2}</b>` : ""
    const strProcessoVarias = valV2 ? `, vinculado ${prepAoV2} ${formatarNomeVinculo(tipoVinculo2)} nº <b>${valV2}</b>,` : ""

    let htmlContent = []

    // CABEÇALHO PADRÃO (Usando Nexus Logo)
    htmlContent.push('<div style="text-align:center; margin-top: 0; margin-bottom: 0.3cm; padding:0; width: 100%;">')
    htmlContent.push('<img src="/img_oficio/oficio_logo.png" alt="Logotipo Rosafarm" style="display:block; margin:0 auto; width:6.5cm; height:auto; padding:0;">')
    htmlContent.push("</div>")

    htmlContent.push('<div style="font-family: Arial, sans-serif; font-size: 10pt; display: flex; justify-content: space-between; margin-top: 0px; border-bottom: 1px solid #999; padding-bottom: 4px; margin-bottom: 20px;">')
    htmlContent.push('<span style="color: #555;">empenhos@rosafarm.com.br</span>')
    htmlContent.push('<span style="font-weight: bold; color: #555;">CNPJ: 00.000.000/0001-99</span>')
    htmlContent.push("</div>")

    if (tipoDoc === "validade") {
      const nfeVal = fmt(nfe.toUpperCase()) || "[Nº DA NFE]"
      
      htmlContent.push('<p style="text-align: center; font-family: Arial, sans-serif; font-size: 12pt; font-weight: bold; text-decoration: underline; margin-bottom: 25px;">CARTA DE COMPROMETIMENTO DE TROCA</p>')
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; line-height: 1.2; margin-bottom: 25px;">À<br>${cli}</p>`)
      
      // Construção das linhas de identificação (NE, Processo, NF, Recebimento)
      let idLines = []
      if (valV2) idLines.push(`${nomeV2}: ${valV2}`)
      
      // Se houver múltiplas ordens, listamos todas no cabeçalho
      const vinculosUnicos = ordensValidade
        .filter(o => o.numVinculo)
        .map(o => `${formatarNomeVinculo(o.tipoVinculo).toUpperCase()}: ${fmt(o.numVinculo.toUpperCase())}`)
      
      if (vinculosUnicos.length > 0) {
        // Remove duplicatas se houver
        const uniqueList = Array.from(new Set(vinculosUnicos))
        idLines.push(...uniqueList)
      } else if (numVinculo1) {
        idLines.push(`${nomeV1}: ${fmt(numVinculo1.toUpperCase())}`)
      }

      idLines.push(`NOTA FISCAL: ${nfeVal}`)
      if (recebimento) idLines.push(`RECEBIMENTO: ${fmt(recebimento)}`)

      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; line-height: 1.2; margin-bottom: 25px;">${idLines.join('<br>')}</p>`)

      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">A empresa <b>ROSAFARM DISTRIBUIDORA</b>, inscrita no CNPJ nº <b>00.000.000/0001-99</b>, com sede à <b>QD ASR NE 55 Alameda 8 (412 Norte), SN – Plano Diretor Norte, CEP 77.006-534, Palmas/TO</b>, vem, por meio desta, apresentar sua CARTA DE <b>COMPROMETIMENTO DE TROCA</b>, referente ao fornecimento realizado para <b>${cli}</b>, conforme <b>Nota Fiscal</b> acima identificada.</p>`)
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt; margin-bottom: 20px;">Declaramos nosso compromisso quanto ao(s) item(ns) abaixo descrito(s):</p>')

      ordensValidade.forEach((ordem) => {
        if (ordensValidade.length > 1 && ordem.numVinculo) {
          htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 10pt; font-weight: bold; color: #555; margin-bottom: 5px; margin-top: 15px; border-bottom: 1px solid #eee;">${formatarNomeVinculo(ordem.tipoVinculo).toUpperCase()} Nº ${fmt(ordem.numVinculo.toUpperCase())}</p>`)
        }

        ordem.itens.forEach(item => {
          htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; font-style: italic; line-height: 1.2; margin-bottom: 15px;">')
          htmlContent.push(`${fmt(item.nome.toUpperCase()) || '[NOME]'}<br>`)
          htmlContent.push(`QTD: ${fmt(item.qtd) || '[QTD]'} | LOTE: ${fmt(item.lote) || '[LOTE]'}<br>`)
          
          let linhaDatas = []
          if (item.fab) linhaDatas.push(`FAB: ${fmt(item.fab)}`)
          linhaDatas.push(`VAL: ${fmt(item.val) || '[VAL]'}`)
          htmlContent.push(linhaDatas.join(' | '))
          
          htmlContent.push('</p>')
        })
      })

      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt; margin-top: 20px;">Comprometemo-nos que, caso o material não atenda ao prazo mínimo de validade estabelecido em edital ou não venha a ser utilizado dentro do período estipulado, realizaremos o recolhimento integral dos produtos e efetuaremos a substituição por itens com prazo de validade em conformidade com as exigências editalícias, sem qualquer ônus para o Órgão Contratante.</p>')
      htmlContent.push('<div style="page-break-inside: avoid; break-inside: avoid;">')
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">Ressaltamos ainda que toda a logística necessária para o recolhimento dos produtos e posterior entrega dos novos itens será de nossa inteira responsabilidade, garantindo o pleno atendimento às exigências legais.</p>')
    } else if (tipoDoc === "troca_marca") {
      let strEmpenhos = ""
      if (empenhosVinculados.trim()) {
        if (tipoVinculo1 === 'arp') {
          strEmpenhos = `, com fornecimento destinado às Notas de Empenho nºs <b>${fmt(empenhosVinculados.trim().toUpperCase())}</b>`
        } else {
          strEmpenhos = ` (e às Notas de Empenho nºs <b>${fmt(empenhosVinculados.trim().toUpperCase())}</b>)`
        }
      }
      htmlContent.push('<p style="text-align: center; font-family: Arial, sans-serif; font-size: 12pt; font-weight: bold;">SOLICITAÇÃO DE TROCA DE MARCA</p>')
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; line-height: 1.2; margin-bottom: 25px;">À<br>${cli}</p>`)
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 12pt;">PALMAS - TO, ${dataExtensa}.</p>`)
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">A empresa ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA, inscrita no CNPJ nº: 00.000.000/0001-99, com sede na ALAMEDA 08, QUADRA 412 NORTE, CEP: 77.006-534, Palmas/TO.</p>')
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">Em atenção ${prepAoV1} ${formatarNomeVinculo(tipoVinculo1)} nº <b>${valV1}</b>${strEmpenhos}${strProcesso}, vimos, por meio deste, solicitar a autorização para <b>troca da marca</b> dos produtos especificados abaixo:</p>`)

      itensTroca.forEach((item, index) => {
        const itemLine = `<b>${index + 1}. ${fmt(item.nome.toUpperCase()) || "[NOME DO ITEM]"}</b>${item.qtd ? ` - <b>QTD: ${fmt(item.qtd)}</b>` : ''}`
        htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">${itemLine}<br>`)
        htmlContent.push(`<b>Descrição Técnica:</b> ${fmt(item.desc.toUpperCase()) || "[DESCRIÇÃO TÉCNICA]"}<br>`)
        
        let linhaSub = `<b>Substituição:</b> da marca originalmente prevista, <b>${fmt(item.antiga.toUpperCase()) || "[MARCA ANTIGA]"}</b>, pela marca <b>${fmt(item.nova.toUpperCase()) || "[MARCA NOVA]"}</b>`
        if (item.anvisa) linhaSub += ` (<b>Reg. ANVISA: ${fmt(item.anvisa.toUpperCase())}</b>)`
        linhaSub += `, em razão da indisponibilidade de matéria-prima por parte da indústria.</p>`
        htmlContent.push(linhaSub)
      })

      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">Ressaltamos que os produtos da(s) nova(s) marca(s) apresentam <b>qualidade equivalente ou superior</b> àqueles inicialmente especificados, estando <b>disponíveis em estoque para pronta entrega</b>.</p>')
      htmlContent.push('<div style="page-break-inside: avoid; break-inside: avoid;">')
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">Importa destacar que <b>a troca de marca não acarretará qualquer ônus adicional ao Órgão Contratante</b>, mantendo-se as condições pactuadas.</p>')
    } else if (tipoDoc === "cancelamento_parcial") {
      htmlContent.push('<p style="text-align: center; font-family: Arial, sans-serif; font-size: 14pt; font-weight: bold; text-decoration: underline; margin-bottom: 30px;">SOLICITAÇÃO DE CANCELAMENTO PARCIAL DE SALDO</p>')
      htmlContent.push(`<p style="text-align: right; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 30px;">PALMAS - TO, ${dataExtensa}.</p>`)
      
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 15px;">Prezados,</p>`)
      
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 20px;">A <b>ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA</b>, por meio de seu representante legal, vem à presença de Vossa Senhoria informar a impossibilidade de atendimento integral da quantidade solicitada ${prepAoV1} <b>${formatarNomeVinculo(tipoVinculo1).toUpperCase()} nº ${valV1}</b>${strProcessoVarias} exclusivamente em razão da incompatibilidade de fracionamento da embalagem original de fábrica.</p>`)

      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 20px;">Esclarecemos que os itens abaixo relacionados possuem apresentações comerciais cujas embalagens secundárias são íntegras e invioláveis. Para garantir a total rastreabilidade do lote, integridade física dos medicamentos e conformidade com as normas sanitárias vigentes, este fornecedor não realiza o fracionamento de caixas originais. Dado que a quantidade solicitada em empenho não é múltipla exata da embalagem comercializada pelo fabricante, solicitamos o cancelamento do saldo remanescente, conforme detalhado abaixo:</p>')

      htmlContent.push('<table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-family: Arial, sans-serif; font-size: 10pt;">')
      htmlContent.push('<tr style="background-color: #f2f2f2;">')
      htmlContent.push('<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Descrição do Item</th>')
      htmlContent.push('<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Qtd. Empenho</th>')
      htmlContent.push('<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Apresentação</th>')
      htmlContent.push('<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Qtd. a Entregar</th>')
      htmlContent.push('<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Saldo a Cancelar</th>')
      htmlContent.push('</tr>')

      itensCancelamento.forEach(item => {
        const solicitadoStr = fmt(item.qtdSolicitada) || '0'
        const atendidoStr = fmt(item.qtdAtendida) || '0'
        const solicitado = parseFloat(solicitadoStr.replace(',', '.')) || 0
        const atendido = parseFloat(atendidoStr.replace(',', '.')) || 0
        const saldo = Math.max(0, solicitado - atendido)

        htmlContent.push('<tr>')
        htmlContent.push(`<td style="border: 1px solid #ddd; padding: 8px;">${fmt(item.descricao.toUpperCase())}</td>`)
        htmlContent.push(`<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${solicitadoStr}</td>`)
        htmlContent.push(`<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${fmt(item.embalagem) || '-'}</td>`)
        htmlContent.push(`<td style="border: 1px solid #ddd; padding: 8px; text-align: center;"><b>${atendidoStr}</b></td>`)
        htmlContent.push(`<td style="border: 1px solid #ddd; padding: 8px; text-align: center; color: #d32f2f;">${saldo.toString().replace('.', ',')}</td>`)
        htmlContent.push('</tr>')
      })
      htmlContent.push('</table>')

      const justFinal = justificativaCancelamento ? `<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 25px;"><b>Justificativa Adicional:</b> ${fmt(justificativaCancelamento)}</p>` : ''
      htmlContent.push(justFinal)
      
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 25px;">Outrossim, em observância aos princípios da economicidade e da eficiência administrativa, manifestamos nossa plena disponibilidade para proceder com o eventual apostilamento ou reempenho dos quantitativos, caso seja do interesse desse Órgão a adequação dos valores à múltipla de embalagem comercializada, em substituição ao cancelamento ora pleiteado.</p>')

      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 25px;">Ressaltamos nosso compromisso com o atendimento ágil e seguro, colocando-nos à disposição para quaisquer esclarecimentos que se façam necessários.</p>')
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 25px;">Atenciosamente,</p>')
    } else if (tipoDoc === "comunicado_reajuste") {
      htmlContent.push(`<p style="text-align: right; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 30px;">${fmt(localData)}</p>`)
      htmlContent.push('<p style="text-align: center; font-family: Arial, sans-serif; font-size: 14pt; font-weight: bold; text-decoration: underline; margin-bottom: 30px;">COMUNICADO AO MERCADO</p>')
      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 20px;">Reajuste de preços – Pressão global de custos e restrição de oferta</p>')
      
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 15px;">Vimos, por meio deste, prestar esclarecimentos sobre a atual situação do mercado global de insumos e matérias-primas, em consonância com o <b>comunicado oficial emitido pela indústria fabricante ${fmt(nomeIndustria)}</b> (documento em anexo), que detalha as severas pressões de custos que vêm afetando toda a cadeia de suprimentos.</p>`)
      
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 15px;">Conforme reportado pela indústria, o cenário geopolítico recente provocou forte elevação no preço do petróleo, impactando diretamente toda a cadeia petroquímica, energia e logística. Adicionalmente, observa-se uma <b>restrição relevante na oferta global de matérias-primas</b>, elevando o risco de escassez e impactando severamente os custos de produção.</p>`)
      
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 15px;">Os custos logísticos também foram fortemente afetados, com os fretes marítimos apresentando triplicação dos custos, reuniões de redução da previsibilidade e aumentando significativamente os prazos de entrega.</p>')
      
      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 10px;">Principais variações reportadas (Nov/2025 - atual)</p>')
      
      htmlContent.push('<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 10pt;">')
      htmlContent.push('<thead><tr style="background-color: #f3f4f6;"><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Matéria Prima</th><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Variação</th></tr></thead>')
      htmlContent.push('<tbody>')
      itensVariacao.forEach(item => {
        htmlContent.push(`<tr><td style="border: 1px solid #ddd; padding: 8px;">${fmt(item.materiaPrima) || '[MATÉRIA]'}</td><td style="border: 1px solid #ddd; padding: 8px;">${fmt(item.variacao) || '[VARIAÇÃO]'}</td></tr>`)
      })
      htmlContent.push('</tbody></table>')
      
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 20px;">Os aumentos mais relevantes concentram-se em insumos críticos, com impacto direto na disponibilidade global de diversos produtos.</p>')
      
      htmlContent.push('<div style="page-break-inside: avoid;">')
      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 10px;">Leitura de cenário (Dados da Indústria)</p>')
      htmlContent.push('<ul style="font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 20px;">')
      htmlContent.push('<li>Pressão relevante nos custos de matérias-primas;</li>')
      htmlContent.push('<li>Elevação dos custos de energia;</li>')
      htmlContent.push('<li>Triplicação dos custos logísticos;</li>')
      htmlContent.push('<li>Logística internacional afetada e menor previsibilidade;</li>')
      htmlContent.push('<li>Restrição de oferta e risco de escassez;</li>')
      htmlContent.push('</ul>')
      
      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 10px;">Posicionamento da Rosafarm</p>')
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 15px;">A Rosafarm, como distribuidora comprometida com a transparência, busca mitigar tais impactos junto aos seus clientes, prezando pela continuidade do fornecimento. Contudo, diante da magnitude das variações reportadas pelos fabricantes, torna-se necessário o realinhamento de preços para garantir a sustentabilidade das operações e a manutenção do estoque.</p>')
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 15px;">Reafirmamos nosso esforço contínuo para garantir que os reajustes ocorram de forma responsável e transparente.</p>')
      
      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 10px;">Compromisso</p>')
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 20px;">A Rosafarm reforça seu compromisso com a continuidade do fornecimento e a parceria de longo prazo com seus clientes.</p>')
      htmlContent.push('</div>')
      
      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; margin-top: 30px;">Atenciosamente,</p>')
    } else if (tipoDoc === "dilacao_prazo") {
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; line-height: 1.4; margin-bottom: 20px;">À ${cli}<br>`)
      htmlContent.push('A/C: Unidade de Contratos e Gestão de Contratos</p>')
      
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 15px;">Assunto: Pedido de Dilação de Prazo para Entrega de Itens do Empenho nº ${valV1}</p>`)
      
      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 20px;">Referência:<br>')
      htmlContent.push(`•	Empenho: nº ${valV1}<br>`)
      if (numOF) htmlContent.push(`•	Ordem de Fornecimento: nº ${fmt(numOF)}<br>`)
      if (numContrato) htmlContent.push(`•	Contrato: nº ${fmt(numContrato)}<br>`)
      if (numAta) htmlContent.push(`•	Ata de Registro de Preços: nº ${fmt(numAta)}</p>`)

      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; margin-bottom: 20px;"><b>ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA</b>, inscrita no CNPJ sob o nº <b>00.000.000/0001-99</b>, com sede na <b>ALAMEDA 08, QUADRA 412 NORTE, CEP: 77.006-534, Palmas/TO</b>, vem, por intermédio deste, solicitar formalmente a dilação do prazo de entrega por <b>${fmt(prazoSolicitado)} dias</b>, referente aos itens constantes na Ordem de Fornecimento supracitada, com base nos fatos e justificativas a seguir expostos:</p>`)
      
      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 10px;">1. Dos Itens Objeto da Solicitação</p>')
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 10px;">O pedido de prorrogação refere-se ao fornecimento de Equipamentos de Proteção Individual (EPI), especificamente:</p>')
      
      htmlContent.push('<ul style="font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 20px;">')
      itensDilacao.forEach(item => {
        htmlContent.push(`<li style="margin-bottom: 8px;"><b>Item ${fmt(item.numero)}:</b> ${fmt(item.descricao)}. Marca/Fabricante: <b>${fmt(item.marca)}</b>.</li>`)
      })
      htmlContent.push('</ul>')

      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 10px;">2. Da Justificativa: Escassez de Insumos e Cenário Global</p>')
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; white-space: pre-wrap; margin-bottom: 20px;">${fmt(justificativaDilacao)}</p>`)

      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 10px;">3. Do Pedido</p>')
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; margin-bottom: 20px;">Diante da impossibilidade temporária de garantir o estoque para pronta entrega devido à falta de insumos no fabricante, solicitamos a vossa senhoria a dilação do prazo por mais <b>${fmt(prazoSolicitado)} dias</b>, período necessário para a regularização do fluxo de abastecimento e entrega no Almoxarifado da ${cli}.</p>`)
      
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 30px;">Ressaltamos nosso compromisso com a Administração Pública e a transparência na execução deste contrato.</p>')
      
      htmlContent.push(`<p style="text-align: right; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 30px;">PALMAS - TO, ${dataExtensa}.</p>`)
    } else if (tipoDoc === 'termo_doacao') {
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 5px;">Prezados,</p>`)
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; text-transform: uppercase; margin-bottom: 15px;">${fmt(doacaoTitulo) || 'TERMO DE DOAÇÃO DE AGULHAS'}</p>`)
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 25px;">${fmt(doacaoLocalData) || 'PALMAS – TO, 02 DE JUNHO DE 2026.'}</p>`)

      htmlContent.push(`<p style="text-align: center; font-family: Arial, sans-serif; font-size: 13pt; font-weight: bold; letter-spacing: 1px; margin: 25px 0;">TERMO DE DOAÇÃO</p>`)

      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; margin-bottom: 15px;">
        Pelo presente instrumento particular, de um lado, a empresa <b>ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA</b>, inscrita no CNPJ nº <b>00.000.000/0001-99</b>, com Inscrição Estadual nº <b>29.505.442-5</b>, sediada na Rua Q ASR NE 55, Alameda 8, Lote 07, QI 09, CEP: <b>77.006-534</b>, na cidade de Palmas – TO, telefone nº <b>(63) 9292-7667</b> e e-mail <b>licitacoes@rosafarm.com.br</b>, neste ato representada por seu representante legal, doravante denominada <b>DOADORA</b>;
      </p>`)

      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; margin-bottom: 20px;">
        e, de outro lado, a <b>${(fmt(doacaoDonataria) || 'UNIVERSIDADE ESTADUAL DE CIÊNCIAS DA SAÚDE DE ALAGOAS – UNCISAL').toUpperCase()}</b>${doacaoDonatariaCnpj ? `, inscrita no CNPJ sob o nº <b>${fmt(doacaoDonatariaCnpj)}</b>` : ''}, doravante denominada <b>DONATÁRIA</b>, celebram o presente TERMO DE DOAÇÃO, mediante as cláusulas e condições seguintes:
      </p>`)

      htmlContent.push(`<div style="margin-bottom: 15px;">
        <p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 5px;">CLÁUSULA PRIMEIRA – DO OBJETO</p>
        <p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; margin-bottom: 15px;">
          O presente instrumento tem por objeto a doação, de forma pura e gratuita, sem quaisquer ônus ou encargos, dos bens móveis relacionados no Anexo Único deste Termo, de propriedade da DOADORA, passando os mesmos a integrar o patrimônio da DONATÁRIA.
        </p>
      </div>`)

      // Anexo único com os itens
      htmlContent.push(`<div style="margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid;">
        <p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 8px;">ANEXO ÚNICO</p>
        <ul style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; padding-left: 20px; margin-bottom: 15px;"> bounds`)
      
      itensDoacao.forEach(item => {
        const descStr = fmt(item.descricao) || '[PRODUTO]'
        const marcaStr = item.marca ? `, marca ${fmt(item.marca)}` : ''
        const qtdStr = item.quantidade ? ` – ${fmt(item.quantidade)} unidades` : ''
        const valorStr = item.valor_estimado ? ` – Valor estimado: ${fmt(item.valor_estimado)}` : ''
        htmlContent.push(`<li style="margin-bottom: 5px;">${descStr}${marcaStr}${qtdStr}${valorStr}.</li>`)
      })
      
      htmlContent.push(`</ul></div>`)

      htmlContent.push(`<div style="margin-bottom: 15px; page-break-inside: avoid; break-inside: avoid;">
        <p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 5px;">CLÁUSULA SEGUNDA – DA ENTREGA E TRANSPORTE</p>
        <p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; margin-bottom: 15px;">
          Os bens descritos no Anexo Único encontram-se em condições de uso. A entrega será realizada pela DOADORA diretamente nas dependências da DONATÁRIA, no seguinte endereço:<br>
          <b>${fmt(doacaoEndereco) || '[ENDEREÇO DA DONATÁRIA]'}</b>
        </p>
      </div>`)

      htmlContent.push(`<div style="margin-bottom: 15px; page-break-inside: avoid; break-inside: avoid;">
        <p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 5px;">CLÁUSULA TERCEIRA – DA ACEITAÇÃO</p>
        <p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; margin-bottom: 15px;">
          A DONATÁRIA declara aceitar a presente doação no exato estado em que se encontram os bens, comprometendo-se a utilizá-los exclusivamente para a consecução de suas finalidades públicas e de interesse social.
        </p>
      </div>`)

      htmlContent.push(`<div style="margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid;">
        <p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 5px;">CLÁUSULA QUARTA – DO FORO</p>
        <p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; margin-bottom: 15px;">
          Para dirimir quaisquer dúvidas oriundas da execução deste Termo de Doação, as partes elegem o Foro da Comarca de <b>${fmt(doacaoForo) || '[COMARCA DO CLIENTE]'}</b>, com renúncia expressa de qualquer outro, por mais privilegiado que seja.
        </p>
      </div>`)

      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; margin-bottom: 25px; page-break-inside: avoid; break-inside: avoid;">
        E, por estarem justos e acordados, firmam o presente instrumento em 02 (duas) vias de igual teor e forma, na presença de duas testemunhas.
      </p>`)

      // Rodapé e assinaturas
      htmlContent.push(`<div style="page-break-inside: avoid; break-inside: avoid; margin-top: 30px;">`)
      htmlContent.push(`<p style="text-align: center; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 35px;">${fmt(doacaoLocalData) || '[LOCAL E DATA]'}</p>`)
      
      // Assinatura Doadora e Donatária
      htmlContent.push(`<div style="display: flex; justify-content: space-between; gap: 40px; font-family: Arial, sans-serif; font-size: 10pt; text-align: center; margin-bottom: 40px;">`)
      htmlContent.push(`<div style="flex: 1;"><div style="border-top: 1.5px solid #333; margin-bottom: 6px;"></div><p style="margin: 0; font-weight: bold;">ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA</p><p style="margin: 2px 0;">DOADORA</p></div>`)
      htmlContent.push(`<div style="flex: 1;"><div style="border-top: 1.5px solid #333; margin-bottom: 6px;"></div><p style="margin: 0; font-weight: bold;">${(fmt(doacaoDonataria) || 'DONATÁRIA').toUpperCase()}</p><p style="margin: 2px 0;">DONATÁRIA</p></div>`)
      htmlContent.push(`</div>`)

      // Testemunhas
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; margin-bottom: 30px;">TESTEMUNHAS:</p>`)
      htmlContent.push(`<div style="display: flex; justify-content: space-between; gap: 40px; font-family: Arial, sans-serif; font-size: 10pt; text-align: left;">`)
      htmlContent.push(`<div style="flex: 1;"><div style="border-top: 1.5px solid #333; margin-bottom: 6px; width: 80%;"></div><p style="margin: 0;">Nome:</p><p style="margin: 2px 0;">CPF:</p></div>`)
      htmlContent.push(`<div style="flex: 1;"><div style="border-top: 1.5px solid #333; margin-bottom: 6px; width: 80%;"></div><p style="margin: 0;">Nome:</p><p style="margin: 2px 0;">CPF:</p></div>`)
      htmlContent.push(`</div>`)
      htmlContent.push(`</div>`)

      const finalHtmlDoacao = htmlContent.join('')
      setPreviewHtml(finalHtmlDoacao)
      return finalHtmlDoacao
    } else if (tipoDoc === 'termo_recolhimento') {
      // Cabeçalho Estático
      htmlContent.push(`<div style="text-align: center; font-family: Arial, sans-serif; font-size: 10pt; border-bottom: 1.5px solid #333; padding-bottom: 10px; margin-bottom: 18px;">`)
      htmlContent.push(`<p style="font-size: 13pt; font-weight: bold; margin: 0;">ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA</p>`)
      htmlContent.push(`<p style="margin: 2px 0;">CNPJ: 00.000.000/0001-99</p>`)
      htmlContent.push(`<p style="margin: 2px 0;">QUADRA ASR NE 55 ALAMEDA 8, 07, LOTE 07, PLANO DIRETOR NORTE</p>`)
      htmlContent.push(`<p style="margin: 2px 0;">CEP: 77.006-534, PALMAS - TO | Contato: (63) 99292-7667</p>`)
      htmlContent.push(`</div>`)

      // Título
      htmlContent.push(`<p style="text-align: center; font-family: Arial, sans-serif; font-size: 14pt; font-weight: bold; letter-spacing: 1px; margin: 22px 0 22px 0;">TERMO DE RECOLHIMENTO</p>`)

      // Dados do cliente
      htmlContent.push(`<div style="border: 1px solid #ccc; border-radius: 4px; padding: 10px 14px; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 11pt;">`)
      htmlContent.push(`<p style="margin: 3px 0;"><b>CNPJ:</b> ${fmt(recolhCnpj) || '[CNPJ DO CLIENTE]'}</p>`)
      htmlContent.push(`<p style="margin: 3px 0;"><b>Razão Social:</b> ${(fmt(recolhRazaoSocial) || '[RAZÃO SOCIAL]').toUpperCase()}</p>`)
      htmlContent.push(`<p style="margin: 3px 0;"><b>Contato:</b> ${fmt(recolhContato) || '[CONTATO]'}</p>`)
      htmlContent.push(`</div>`)

      // Corpo do texto
      const motivo = fmt(recolhMotivo) || '[MOTIVO DO RECOLHIMENTO]'
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 11.5pt; line-height: 1.7; margin-bottom: 20px;">Declaramos para os devidos fins que estamos procedendo com o recolhimento das mercadorias abaixo listadas, pertencentes à empresa acima qualificada, em virtude de <b>${motivo}</b>, conforme solicitação e em conformidade com as normas vigentes.</p>`)

      // Tabela de itens
      htmlContent.push(`<table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 9.5pt; margin-bottom: 30px; page-break-inside: avoid;">`)
      htmlContent.push(`<thead><tr style="background-color: #f2f2f2;">`)
      htmlContent.push(`<th style="border: 1px solid #bbb; padding: 6px 5px; text-align: center;">CÓDIGO</th>`)
      htmlContent.push(`<th style="border: 1px solid #bbb; padding: 6px 5px; text-align: left;">DESCRIÇÃO DO PRODUTO</th>`)
      htmlContent.push(`<th style="border: 1px solid #bbb; padding: 6px 5px; text-align: center;">LOTE</th>`)
      htmlContent.push(`<th style="border: 1px solid #bbb; padding: 6px 5px; text-align: center;">VALIDADE</th>`)
      htmlContent.push(`<th style="border: 1px solid #bbb; padding: 6px 5px; text-align: center;">QTD.</th>`)
      htmlContent.push(`<th style="border: 1px solid #bbb; padding: 6px 5px; text-align: right;">VL. UNITÁRIO</th>`)
      htmlContent.push(`<th style="border: 1px solid #bbb; padding: 6px 5px; text-align: right;">VL. TOTAL</th>`)
      htmlContent.push(`</tr></thead><tbody>`)
      itensRecolhimento.forEach(item => {
        htmlContent.push(`<tr>`)
        htmlContent.push(`<td style="border: 1px solid #bbb; padding: 5px; text-align: center;">${fmt(item.codigo) || '-'}</td>`)
        htmlContent.push(`<td style="border: 1px solid #bbb; padding: 5px;">${(fmt(item.descricao) || '[DESCRIÇÃO]').toUpperCase()}</td>`)
        htmlContent.push(`<td style="border: 1px solid #bbb; padding: 5px; text-align: center;">${fmt(item.lote) || '-'}</td>`)
        htmlContent.push(`<td style="border: 1px solid #bbb; padding: 5px; text-align: center;">${fmt(item.validade) || '-'}</td>`)
        htmlContent.push(`<td style="border: 1px solid #bbb; padding: 5px; text-align: center;">${fmt(item.quantidade) || '-'}</td>`)
        htmlContent.push(`<td style="border: 1px solid #bbb; padding: 5px; text-align: right;">${fmt(item.valor_unitario) || '-'}</td>`)
        htmlContent.push(`<td style="border: 1px solid #bbb; padding: 5px; text-align: right; font-weight: bold;">${fmt(item.valor_total) || '-'}</td>`)
        htmlContent.push(`</tr>`)
      })
      htmlContent.push(`</tbody></table>`)

      // Rodapé e assinaturas
      htmlContent.push(`<div style="page-break-inside: avoid; break-inside: avoid; margin-top: 40px;">`)
      htmlContent.push(`<p style="text-align: center; font-family: Arial, sans-serif; font-size: 11pt; margin-bottom: 40px;">${fmt(recolhLocalData) || '[LOCAL E DATA]'}</p>`)
      htmlContent.push(`<div style="display: flex; justify-content: space-between; gap: 40px; font-family: Arial, sans-serif; font-size: 10pt; text-align: center;">`)
      htmlContent.push(`<div style="flex: 1;"><div style="border-top: 1.5px solid #333; margin-bottom: 6px;"></div><p style="margin: 0;">Assinatura do Responsável pelo Recolhimento</p><p style="margin: 2px 0; font-weight: bold;">ROSAFARM DISTRIBUIDORA</p></div>`)
      htmlContent.push(`<div style="flex: 1;"><div style="border-top: 1.5px solid #333; margin-bottom: 6px;"></div><p style="margin: 0;">Assinatura do Cliente / Responsável pela Entrega</p></div>`)
      htmlContent.push(`</div>`)
      htmlContent.push(`</div>`)

      // Pular o rodapé padrão de assinatura (return early)
      const finalHtmlRecolh = htmlContent.join('')
      setPreviewHtml(finalHtmlRecolh)
      return finalHtmlRecolh
    } else if (tipoDoc === "justificativa_descritivo") {
      htmlContent.push('<p style="text-align: center; font-family: Arial, sans-serif; font-size: 12pt; font-weight: bold; text-decoration: underline; margin-bottom: 25px;">JUSTIFICATIVA DE ALTERAÇÃO DE DESCRITIVO</p>')
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; line-height: 1.2; margin-bottom: 25px;">À<br>${cli}</p>`)
      htmlContent.push(`<p style="font-family: Arial, sans-serif; font-size: 12pt;">PALMAS - TO, ${dataExtensa}.</p>`)
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">A empresa <b>ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA</b>, inscrita no CNPJ nº <b>00.000.000/0001-99</b>, com sede na <b>ALAMEDA 08, QUADRA 412 NORTE, CEP: 77.006-534, Palmas/TO</b>.</p>')
      
      let refTexto = ""
      if (valV1) {
        refTexto = `Em atenção ${prepAoV1} ${formatarNomeVinculo(tipoVinculo1)} nº <b>${valV1}</b>`
        if (valV2) {
          refTexto += `, vinculado ${prepAoV2} ${formatarNomeVinculo(tipoVinculo2)} nº <b>${valV2}</b>`
        }
      } else {
        refTexto = `Vimos, por meio deste,`
      }
      
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">${refTexto}, apresentar justificativa para a adequação do descritivo do(s) produto(s) abaixo relacionado(s):</p>`)

      itensDescritivo.forEach((item, index) => {
        htmlContent.push(`<div style="margin-bottom: 15px; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4;">`)
        htmlContent.push(`<b>${index + 1}. ${fmt(item.nome.toUpperCase()) || "[NOME DO MEDICAMENTO/ITEM]"}</b><br>`)
        htmlContent.push(`• <b>Descritivo em Empenho/Edital:</b> ${fmt(item.descOriginal.toUpperCase()) || "[DESCRITIVO ORIGINAL]"}<br>`)
        htmlContent.push(`• <b>Descritivo Proposto para Entrega:</b> ${fmt(item.descProposto.toUpperCase()) || "[DESCRITIVO PROPOSTO]"}`)
        htmlContent.push(`</div>`)
      })

      htmlContent.push('<p style="font-family: Arial, sans-serif; font-size: 12pt; font-weight: bold; margin-top: 20px; margin-bottom: 8px;">Justificativa:</p>')
      htmlContent.push(`<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt; white-space: pre-wrap; line-height: 1.5; margin-bottom: 20px;">${fmt(justificativaDescritivo)}</p>`)
      
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt; margin-top: 20px;">Ressaltamos que a alteração sugerida não altera o objeto contratado, preserva a dosagem e finalidade terapêutica do medicamento e <b>não acarretará qualquer ônus adicional ao Órgão Contratante</b>, mantendo-se os termos econômicos originais.</p>')
      htmlContent.push('<div style="page-break-inside: avoid; break-inside: avoid;">')
      htmlContent.push('<p style="text-align: justify; font-family: Arial, sans-serif; font-size: 12pt;">Ficamos no aguardo de manifestação quanto ao aceite e colocamo-nos à disposição para esclarecimentos adicionais.</p>')
    }

    htmlContent.push(`
      <div style="margin-top: 40px; page-break-inside: avoid; break-inside: avoid;">
        <p style="font-family: Arial, sans-serif; font-size: 10pt; color: #888; margin-bottom: 6px; text-align: center;">Assinatura Digital / Carimbo</p>
        <div style="
          width: 13cm;
          height: 3cm;
          border: 1.5px dashed #bbb;
          border-radius: 6px;
          margin: 0 auto 20px auto;
          background: #fafafa;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <span style="font-family: Arial, sans-serif; font-size: 9pt; color: #ccc; user-select: none;">[ Área reservada para assinatura ]</span>
        </div>
        <p style="text-align: center; font-family: Arial, sans-serif; font-size: 12pt;">
          ______________________________________________________________<br>
          <b>ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS</b><br>
          CNPJ 00.000.000/0001-99
        </p>
      </div>
    </div>`)

    const finalHtml = htmlContent.join("")
    setPreviewHtml(finalHtml)
    return finalHtml
  }

  const salvarPDF = () => {
    // Garante que o preview esteja atualizado antes de imprimir
    gerarDocumento()
    
    const originalTitle = document.title

    // Mapeamento amigável do tipo de documento
    const mapTipoDoc: Record<string, string> = {
      troca_marca: 'Solicitação de Troca de Marca',
      validade: 'Comprometimento de Troca (Validade)',
      cancelamento_parcial: 'Cancelamento Parcial de Empenho',
      dilacao_prazo: 'Solicitação de Dilação de Prazo',
      comunicado_reajuste: 'Comunicado de Reajuste',
      termo_recolhimento: 'Termo de Recolhimento',
      termo_doacao: 'Termo de Doação',
      justificativa_descritivo: 'Carta de Justificativa de Descritivo'
    }
    const tipoDocumento = mapTipoDoc[tipoDoc] || tipoDoc

    // Número do documento principal (Empenho / ARP / etc)
    let docNumero = ''
    if (tipoDoc === 'validade') {
      const numVins = ordensValidade.map(o => o.numVinculo).filter(Boolean)
      docNumero = numVins.length > 0 ? numVins.join(', ') : numVinculo1
    } else {
      const partesDoc: string[] = []
      if (numVinculo1) partesDoc.push(numVinculo1)
      if (numOF) partesDoc.push(`OF ${numOF}`)
      if (numContrato) partesDoc.push(`Contrato ${numContrato}`)
      if (numAta) partesDoc.push(`Ata ${numAta}`)
      docNumero = partesDoc.join(', ')
    }

    // Identificação do(s) item(ns) em questão
    let itemNomes: string[] = []
    if (tipoDoc === 'troca_marca') {
      itemNomes = itensTroca.map(it => it.nome).filter(Boolean)
    } else if (tipoDoc === 'validade') {
      itemNomes = ordensValidade.flatMap(o => o.itens).map(it => it.nome).filter(Boolean)
    } else if (tipoDoc === 'cancelamento_parcial') {
      itemNomes = itensCancelamento.map(it => it.descricao).filter(Boolean)
    } else if (tipoDoc === 'dilacao_prazo') {
      itemNomes = itensDilacao.map(it => it.descricao).filter(Boolean)
    } else if (tipoDoc === 'comunicado_reajuste') {
      itemNomes = itensVariacao.map(it => it.materiaPrima).filter(Boolean)
    } else if (tipoDoc === 'termo_recolhimento') {
      itemNomes = itensRecolhimento.map(it => it.descricao).filter(Boolean)
    } else if (tipoDoc === 'termo_doacao') {
      itemNomes = itensDoacao.map(it => it.descricao).filter(Boolean)
    } else if (tipoDoc === 'justificativa_descritivo') {
      itemNomes = itensDescritivo.map(it => it.nome).filter(Boolean)
    }

    let itemLabel = ''
    if (itemNomes.length > 0) {
      const primeiroItem = itemNomes[0]
      const primeiroItemCortado = primeiroItem.length > 60 
        ? primeiroItem.substring(0, 57) + '...' 
        : primeiroItem
      itemLabel = itemNomes.length === 1 ? primeiroItemCortado : `${primeiroItemCortado} e outros`
    }

    // Montar e higienizar o título do arquivo
    const partesTitulo = [tipoDocumento, docNumero, itemLabel].map(p => p?.trim()).filter(Boolean)
    const novoTitulo = partesTitulo.join(' - ').replace(/[/\\?%*:|"<>]/g, '-')

    document.title = novoTitulo

    // Pequeno timeout para garantir que o DOM atualizou
    setTimeout(() => {
      window.print()
      document.title = originalTitle
    }, 150)
  }

  useEffect(() => {
    gerarDocumento()
  }, [tipoDoc, cliente, tipoVinculo1, numVinculo1, tipoVinculo2, numVinculo2, empenhosVinculados, nfe, recebimento, itensCancelamento, justificativaCancelamento, ordensValidade, itensTroca, localData, itensVariacao, nomeIndustria, recolhCnpj, recolhRazaoSocial, recolhContato, recolhMotivo, recolhLocalData, itensRecolhimento, doacaoTitulo, doacaoDonataria, doacaoDonatariaCnpj, doacaoEndereco, doacaoForo, doacaoLocalData, itensDoacao, justificativaDescritivo, itensDescritivo])

  return (
    <div className="flex flex-col xl:flex-row gap-6 p-1 min-h-screen">
      {/* Painel de Controle */}
      <div className="w-full xl:w-[450px] space-y-6 print:hidden">
        <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
                    <FileText size={20} />
                </div>
                <CardTitle className="text-xl font-bold">Gerador de Ofícios</CardTitle>
            </div>
            <CardDescription>Crie documentos padronizados em segundos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label>Tipo de Documento</Label>
                <Select value={tipoDoc} onValueChange={setTipoDoc}>
                  <SelectTrigger className="bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="troca_marca">Solicitação de Troca de Marca</SelectItem>
                    <SelectItem value="validade">Comprometimento de Troca (Validade)</SelectItem>
                    <SelectItem value="cancelamento_parcial">Cancelamento Parcial de Empenho</SelectItem>
                    <SelectItem value="dilacao_prazo">Solicitação de Dilação de Prazo</SelectItem>
                    <SelectItem value="comunicado_reajuste">Comunicado de Reajuste (Indústria)</SelectItem>
                    <SelectItem value="termo_recolhimento">Termo de Recolhimento</SelectItem>
                    <SelectItem value="termo_doacao">Termo de Doação</SelectItem>
                    <SelectItem value="justificativa_descritivo">Carta de Justificativa de Descritivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" size="icon" onClick={limparCampos} className="h-10 w-10 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Limpar tudo">
                  <Trash2 size={18} />
                </Button>
              </div>
            </div>

            <Separator className="opacity-50" />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente / Órgão Destino</Label>
                <Input 
                  placeholder="Ex: SECRETARIA DE SAÚDE..." 
                  value={cliente}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCliente(e.target.value)}
                />
              </div>

              {tipoDoc === 'troca_marca' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Referenciar por</Label>
                      <Select value={tipoVinculo1} onValueChange={setTipoVinculo1}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="empenho">Empenho</SelectItem>
                          <SelectItem value="nota_empenho">Nota de Empenho</SelectItem>
                          <SelectItem value="arp">Ata de Registro de Preços (ARP)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{tipoVinculo1 === 'arp' ? 'Número da ARP' : 'Número do Empenho'}</Label>
                      <Input 
                        placeholder={tipoVinculo1 === 'arp' ? 'Ex: 553/2025' : 'Ex: 2026NE...'} 
                        value={numVinculo1}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumVinculo1(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Empenhos Vinculados (Opcional)</Label>
                    <Input 
                      placeholder="Ex: 2026NE00123, 2026NE00124 (ou deixe em branco)" 
                      value={empenhosVinculados}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmpenhosVinculados(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Vínculo 1</Label>
                    <Select value={tipoVinculo1} onValueChange={setTipoVinculo1}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="empenho">Empenho</SelectItem>
                        <SelectItem value="nota_empenho">Nota de Empenho</SelectItem>
                        <SelectItem value="ordem_compra">Ordem de Compra</SelectItem>
                        <SelectItem value="arp">ARP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nº Vínculo 1 {tipoDoc === 'validade' && '(Opcional)'}</Label>
                    <Input 
                      placeholder="2026NE..." 
                      value={numVinculo1}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumVinculo1(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Vínculo 2 (Opcional)</Label>
                  <Select value={tipoVinculo2} onValueChange={setTipoVinculo2}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="processo">Processo</SelectItem>
                      <SelectItem value="empenho">Empenho</SelectItem>
                      <SelectItem value="arp">ARP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nº Vínculo 2</Label>
                  <Input 
                    placeholder="Processo nº..." 
                    value={numVinculo2}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumVinculo2(e.target.value)}
                  />
                </div>
              </div>

              {(tipoDoc === 'validade' || tipoDoc === 'cancelamento_parcial') && (
                <div className="space-y-2">
                  <Label>Número da NFe (Opcional)</Label>
                  <Input 
                    placeholder="000.001.234" 
                    value={nfe}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNfe(e.target.value)}
                  />
                </div>
              )}

              {tipoDoc === 'validade' && (
                <div className="space-y-2">
                  <Label>Data de Recebimento (Opcional)</Label>
                  <Input 
                    placeholder="25/02/2026" 
                    value={recebimento}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecebimento(e.target.value)}
                  />
                </div>
              )}

              {tipoDoc === 'dilacao_prazo' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Nº Ordem Fornecimento</Label>
                      <Input 
                        placeholder="Ex: 2912085/2025" 
                        value={numOF}
                        onChange={(e) => setNumOF(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Prazo Solicitado (Dias)</Label>
                      <Input 
                        placeholder="Ex: 30 (trinta)" 
                        value={prazoSolicitado}
                        onChange={(e) => setPrazoSolicitado(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Nº Contrato</Label>
                      <Input 
                        placeholder="Ex: 700/2025" 
                        value={numContrato}
                        onChange={(e) => setNumContrato(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nº Ata</Label>
                      <Input 
                        placeholder="Ex: 553/2025" 
                        value={numAta}
                        onChange={(e) => setNumAta(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="font-bold text-violet-600">Itens p/ Dilação</Label>
                      <Button variant="outline" size="sm" onClick={adicionarItemDilacao} className="h-7 text-[10px] uppercase font-bold tracking-tighter">
                          <Plus size={14} className="mr-1" /> Add Item
                      </Button>
                    </div>
                    {itensDilacao.map((item) => (
                      <div key={item.id} className="p-3 border border-zinc-200 rounded-xl bg-zinc-50/50 space-y-3 relative group">
                        <div className="flex gap-2">
                          <Input placeholder="Nº ITEM" value={item.numero} onChange={(e) => atualizarItemDilacao(item.id, 'numero', e.target.value)} className="h-8 text-xs font-bold w-20" />
                          <Input placeholder="MARCA/FAB" value={item.marca} onChange={(e) => atualizarItemDilacao(item.id, 'marca', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <Textarea placeholder="DESCRIÇÃO DO ITEM" value={item.descricao} onChange={(e) => atualizarItemDilacao(item.id, 'descricao', e.target.value)} className="min-h-[60px] text-xs" />
                        <Button variant="ghost" size="icon" onClick={() => removerItemDilacao(item.id)} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-100 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-2">
                    <Label>Justificativa de Dilação</Label>
                    <Textarea 
                      placeholder="Descreva os motivos..." 
                      value={justificativaDilacao}
                      onChange={(e) => setJustificativaDilacao(e.target.value)}
                      className="min-h-[120px] text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Itens Dinâmicos */}
              {tipoDoc === 'troca_marca' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-bold text-violet-600">Itens para Troca</Label>
                    <Button variant="outline" size="sm" onClick={adicionarItemTroca} className="h-7 text-[10px] uppercase font-bold tracking-tighter">
                        <Plus size={14} className="mr-1" /> Add Item
                    </Button>
                  </div>
                  {itensTroca.map((item) => (
                    <div key={item.id} className="p-3 border border-zinc-200 rounded-xl bg-zinc-50/50 space-y-3 relative group">
                      <div className="flex gap-2">
                        <Input placeholder="NOME DO ITEM" value={item.nome} onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarItemTroca(item.id, 'nome', e.target.value)} className="h-8 text-xs font-bold" />
                        <Input placeholder="QTD" value={item.qtd} onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarItemTroca(item.id, 'qtd', e.target.value)} className="h-8 text-xs w-20" />
                      </div>
                      <Textarea placeholder="DESCRIÇÃO TÉCNICA" value={item.desc} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => atualizarItemTroca(item.id, 'desc', e.target.value)} className="min-h-[60px] text-xs" />
                      <div className="grid grid-cols-3 gap-2">
                        <Input placeholder="MARCA ORIG." value={item.antiga} onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarItemTroca(item.id, 'antiga', e.target.value)} className="h-8 text-[10px]" />
                        <Input placeholder="NOVA MARCA" value={item.nova} onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarItemTroca(item.id, 'nova', e.target.value)} className="h-8 text-[10px]" />
                        <Input placeholder="ANVISA" value={item.anvisa} onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarItemTroca(item.id, 'anvisa', e.target.value)} className="h-8 text-[10px]" />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removerItemTroca(item.id)} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-100 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {tipoDoc === 'validade' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <Label className="font-bold text-violet-600">Grupos de Ordens / Itens</Label>
                    <Button variant="outline" size="sm" onClick={adicionarOrdemValidade} className="h-7 text-[10px] uppercase font-bold tracking-tighter">
                        <Plus size={14} className="mr-1" /> Add Ordem
                    </Button>
                  </div>
                  
                  {ordensValidade.map((ordem) => (
                    <div key={ordem.id} className="p-4 border-2 border-violet-100 rounded-2xl bg-violet-50/20 space-y-4 relative">
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={ordem.tipoVinculo} onValueChange={(v) => atualizarOrdemValidade(ordem.id, 'tipoVinculo', v)}>
                          <SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="empenho">Empenho</SelectItem>
                            <SelectItem value="nota_empenho">Nota de Empenho</SelectItem>
                            <SelectItem value="ordem_compra">Ordem de Compra</SelectItem>
                            <SelectItem value="arp">ARP</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input 
                          placeholder="Número..." 
                          value={ordem.numVinculo} 
                          onChange={(e) => atualizarOrdemValidade(ordem.id, 'numVinculo', e.target.value)} 
                          className="h-8 text-xs font-bold"
                        />
                      </div>

                      <div className="space-y-3">
                        {ordem.itens.map((item) => (
                          <div key={item.id} className="p-3 border border-zinc-200 dark:border-zinc-850 rounded-xl bg-white dark:bg-zinc-900/40 space-y-3 relative group/item">
                            <Input placeholder="NOME DO ITEM" value={item.nome} onChange={(e) => atualizarItemValidade(ordem.id, item.id, 'nome', e.target.value)} className="h-8 text-xs font-bold" />
                            <div className="grid grid-cols-2 gap-2">
                              <Input placeholder="QTD" value={item.qtd} onChange={(e) => atualizarItemValidade(ordem.id, item.id, 'qtd', e.target.value)} className="h-8 text-[10px]" />
                              <Input placeholder="LOTE" value={item.lote} onChange={(e) => atualizarItemValidade(ordem.id, item.id, 'lote', e.target.value)} className="h-8 text-[10px]" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input placeholder="FAB (Opcional)" value={item.fab} onChange={(e) => atualizarItemValidade(ordem.id, item.id, 'fab', e.target.value)} className="h-8 text-[10px]" />
                              <Input placeholder="VAL" value={item.val} onChange={(e) => atualizarItemValidade(ordem.id, item.id, 'val', e.target.value)} className="h-8 text-[10px]" />
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removerItemValidade(ordem.id, item.id)} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-50 text-red-600 opacity-0 group-hover/item:opacity-100 transition-opacity shadow-sm">
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center pt-1">
                        <Button variant="ghost" size="sm" onClick={() => adicionarItemValidade(ordem.id)} className="h-7 text-[9px] text-violet-600 font-bold hover:bg-violet-100">
                          <Plus size={12} className="mr-1" /> ITEM NA ORDEM
                        </Button>
                        {ordensValidade.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removerOrdemValidade(ordem.id)} className="h-7 text-[9px] text-red-600 font-bold hover:bg-red-50">
                            <Trash2 size={12} className="mr-1" /> REMOVER ORDEM
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tipoDoc === 'cancelamento_parcial' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-bold text-violet-600">Itens p/ Cancelamento</Label>
                    <Button variant="outline" size="sm" onClick={adicionarItemCancelamento} className="h-7 text-[10px] uppercase font-bold tracking-tighter">
                        <Plus size={14} className="mr-1" /> Add Item
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {itensCancelamento.map((item, index) => (
                      <div key={item.id} className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-3 relative group">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Item {index + 1}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" onClick={() => removerItemCancelamento(item.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[10px]">Descrição do Item</Label>
                            <Input 
                              placeholder="Ex: LUVA DE PROCEDIMENTO LATEX TAM M"
                              value={item.descricao}
                              onChange={(e) => atualizarItemCancelamento(item.id, 'descricao', e.target.value.toUpperCase())}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px]">Qtd. Empenho</Label>
                              <Input 
                                placeholder="Ex: 500"
                                value={item.qtdSolicitada}
                                onChange={(e) => atualizarItemCancelamento(item.id, 'qtdSolicitada', e.target.value)}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">Embalagem</Label>
                              <Input 
                                placeholder="Ex: Cx c/ 100"
                                value={item.embalagem}
                                onChange={(e) => atualizarItemCancelamento(item.id, 'embalagem', e.target.value)}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">Qtd. Atender</Label>
                              <Input 
                                placeholder="Ex: 400"
                                value={item.qtdAtendida}
                                onChange={(e) => atualizarItemCancelamento(item.id, 'qtdAtendida', e.target.value)}
                                className="h-8 text-xs font-bold text-brand-accent"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-2">
                    <Label>Justificativa Personalizada (Opcional)</Label>
                    <Textarea 
                      placeholder="Deixe em branco para usar a justificativa padrão..." 
                      value={justificativaCancelamento}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJustificativaCancelamento(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {tipoDoc === 'comunicado_reajuste' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Local e Data</Label>
                    <Input 
                      placeholder="Ex: Cascavel - PR, 12 de Maio de 2026" 
                      value={localData}
                      onChange={(e) => setLocalData(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome da Indústria / Fabricante</Label>
                    <Input 
                      placeholder="Ex: MEDIX BRASIL" 
                      value={nomeIndustria}
                      onChange={(e) => setNomeIndustria(e.target.value)}
                    />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="font-bold text-violet-600">Variações de Matéria Prima</Label>
                      <Button variant="outline" size="sm" onClick={adicionarItemVariacao} className="h-7 text-[10px] uppercase font-bold tracking-tighter">
                          <Plus size={14} className="mr-1" /> Add Linha
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {itensVariacao.map((item) => (
                        <div key={item.id} className="grid grid-cols-2 gap-2 relative group">
                          <Input placeholder="Matéria Prima" value={item.materiaPrima} onChange={(e) => atualizarItemVariacao(item.id, 'materiaPrima', e.target.value)} className="h-8 text-xs" />
                          <div className="flex gap-1">
                            <Input placeholder="Variação" value={item.variacao} onChange={(e) => atualizarItemVariacao(item.id, 'variacao', e.target.value)} className="h-8 text-xs" />
                            <Button variant="ghost" size="icon" onClick={() => removerItemVariacao(item.id)} className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50">
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tipoDoc === 'termo_recolhimento' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>CNPJ do Cliente</Label>
                    <Input
                      placeholder="Ex: 00.000.000/0001-00"
                      value={recolhCnpj}
                      onChange={(e) => setRecolhCnpj(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Razão Social do Cliente</Label>
                    <Input
                      placeholder="Ex: PREFEITURA MUNICIPAL DE..."
                      value={recolhRazaoSocial}
                      onChange={(e) => setRecolhRazaoSocial(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contato</Label>
                    <Input
                      placeholder="Ex: (63) 99999-0000"
                      value={recolhContato}
                      onChange={(e) => setRecolhContato(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Motivo do Recolhimento</Label>
                    <Input
                      placeholder="Ex: avaria, proximidade de vencimento..."
                      value={recolhMotivo}
                      onChange={(e) => setRecolhMotivo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Local e Data</Label>
                    <Input
                      placeholder="Ex: Palmas - TO, 18 de Maio de 2026"
                      value={recolhLocalData}
                      onChange={(e) => setRecolhLocalData(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Label className="font-bold text-violet-600">Itens para Recolher</Label>
                    <Button variant="outline" size="sm" onClick={adicionarItemRecolhimento} className="h-7 text-[10px] uppercase font-bold tracking-tighter">
                      <Plus size={14} className="mr-1" /> Add Item
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {itensRecolhimento.map((item, index) => (
                      <div key={item.id} className="p-3 border border-zinc-200 rounded-xl bg-zinc-50/50 space-y-3 relative group">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Item {index + 1}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" onClick={() => removerItemRecolhimento(item.id)}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Código" value={item.codigo} onChange={(e) => atualizarItemRecolhimento(item.id, 'codigo', e.target.value)} className="h-8 text-xs" />
                          <Input placeholder="Lote" value={item.lote} onChange={(e) => atualizarItemRecolhimento(item.id, 'lote', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <Input placeholder="Descrição do Produto" value={item.descricao} onChange={(e) => atualizarItemRecolhimento(item.id, 'descricao', e.target.value)} className="h-8 text-xs" />
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Validade" value={item.validade} onChange={(e) => atualizarItemRecolhimento(item.id, 'validade', e.target.value)} className="h-8 text-xs" />
                          <Input placeholder="Quantidade" value={item.quantidade} onChange={(e) => atualizarItemRecolhimento(item.id, 'quantidade', e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Vl. Unitário" value={item.valor_unitario} onChange={(e) => atualizarItemRecolhimento(item.id, 'valor_unitario', e.target.value)} className="h-8 text-xs" />
                          <Input placeholder="Vl. Total" value={item.valor_total} onChange={(e) => atualizarItemRecolhimento(item.id, 'valor_total', e.target.value)} className="h-8 text-xs font-bold" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tipoDoc === 'termo_doacao' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Assunto / Objeto da Doação</Label>
                    <Input
                      placeholder="Ex: TERMO DE DOAÇÃO DE AGULHAS"
                      value={doacaoTitulo}
                      onChange={(e) => setDoacaoTitulo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Razão Social da Donatária</Label>
                    <Input
                      placeholder="Ex: UNIVERSIDADE ESTADUAL DE CIÊNCIAS..."
                      value={doacaoDonataria}
                      onChange={(e) => setDoacaoDonataria(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CNPJ da Donatária (Opcional)</Label>
                    <Input
                      placeholder="Ex: 00.000.000/0001-00"
                      value={doacaoDonatariaCnpj}
                      onChange={(e) => setDoacaoDonatariaCnpj(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Endereço de Entrega</Label>
                    <Textarea
                      placeholder="Ex: Rua Doutor Jorge Lima, nº 113, Maceió – AL..."
                      value={doacaoEndereco}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDoacaoEndereco(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Foro (Comarca)</Label>
                    <Input
                      placeholder="Ex: Maceió - AL"
                      value={doacaoForo}
                      onChange={(e) => setDoacaoForo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Local e Data</Label>
                    <Input
                      placeholder="Ex: Palmas - TO, 02 de Junho de 2026."
                      value={doacaoLocalData}
                      onChange={(e) => setDoacaoLocalData(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Label className="font-bold text-violet-600">Bens para Doação</Label>
                    <Button variant="outline" size="sm" onClick={adicionarItemDoacao} className="h-7 text-[10px] uppercase font-bold tracking-tighter">
                      <Plus size={14} className="mr-1" /> Add Item
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {itensDoacao.map((item, index) => (
                      <div key={item.id} className="p-3 border border-zinc-200 rounded-xl bg-zinc-50/50 space-y-3 relative group">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Item {index + 1}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" onClick={() => removerItemDoacao(item.id)}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                        <Input placeholder="Descrição do Bem" value={item.descricao} onChange={(e) => atualizarItemDoacao(item.id, 'descricao', e.target.value)} className="h-8 text-xs" />
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1">
                            <Input placeholder="Marca" value={item.marca} onChange={(e) => atualizarItemDoacao(item.id, 'marca', e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="col-span-1">
                            <Input placeholder="Qtd" value={item.quantidade} onChange={(e) => atualizarItemDoacao(item.id, 'quantidade', e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div className="col-span-1">
                            <Input placeholder="Valor Estimado" value={item.valor_estimado} onChange={(e) => atualizarItemDoacao(item.id, 'valor_estimado', e.target.value)} className="h-8 text-xs" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tipoDoc === 'justificativa_descritivo' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-bold text-violet-600">Itens para Alteração de Descritivo</Label>
                    <Button variant="outline" size="sm" onClick={adicionarItemDescritivo} className="h-7 text-[10px] uppercase font-bold tracking-tighter">
                        <Plus size={14} className="mr-1" /> Add Item
                    </Button>
                  </div>
                  {itensDescritivo.map((item) => (
                    <div key={item.id} className="p-3 border border-zinc-200 rounded-xl bg-zinc-50/50 space-y-3 relative group">
                      <div className="space-y-2">
                        <Label className="text-[10px]">Nome do Item / Medicamento</Label>
                        <Input 
                          placeholder="Ex: DIPIRONA SÓDICA 500MG/ML SOL ORAL" 
                          value={item.nome} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarItemDescritivo(item.id, 'nome', e.target.value)} 
                          className="h-8 text-xs font-bold" 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px]">Descritivo em Empenho / Edital</Label>
                        <Input 
                          placeholder="Ex: FRASCO COM 10ML" 
                          value={item.descOriginal} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarItemDescritivo(item.id, 'descOriginal', e.target.value)} 
                          className="h-8 text-xs" 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px]">Descritivo Proposto para Entrega</Label>
                        <Input 
                          placeholder="Ex: FRASCO COM 20ML (ENTREGA DA MESMA QUANTIDADE TOTAL EM MILILITROS)" 
                          value={item.descProposto} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarItemDescritivo(item.id, 'descProposto', e.target.value)} 
                          className="h-8 text-xs font-semibold text-violet-600" 
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removerItemDescritivo(item.id)} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-100 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  ))}

                  <div className="space-y-2 pt-2">
                    <Label>Justificativa da Alteração</Label>
                    <Textarea 
                      placeholder="Descreva detalhadamente a justificativa para a adequação do descritivo..." 
                      value={justificativaDescritivo}
                      onChange={(e) => setJustificativaDescritivo(e.target.value)}
                      className="min-h-[120px] text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <Button onClick={salvarPDF} className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:opacity-90 transition-all gap-2 text-base font-bold shadow-lg shadow-violet-500/20">
              <Printer size={20} /> Imprimir / Salvar PDF
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <div className="flex-1 flex flex-col items-start p-4 xl:p-8 bg-zinc-100 dark:bg-zinc-900/50 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-inner overflow-y-auto w-full">
        <div className="mb-4 flex items-center gap-2 text-zinc-400 font-medium text-sm animate-pulse print:hidden w-full justify-center">
            <ChevronRight size={16} /> Visualização da Folha A4
        </div>
        <div className="w-full overflow-x-auto py-4 flex justify-start sm:justify-center min-h-max scrollbar-thin">
            <div 
              id="folha-a4"
              className="bg-white w-[21cm] min-h-[29.7cm] p-[0.1cm_2cm_2cm_2cm] shadow-md origin-top scale-[0.6] sm:scale-[0.8] md:scale-[0.9] lg:scale-100 transition-transform print:scale-100 print:shadow-none print:m-0 print:p-[0.1cm_1.2cm_1.5cm_1.2cm]"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
        </div>
        
        {/* CSS para Impressão - Versão Corrigida e Estável */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 0;
            }

            /* Esconde o conteúdo mas mantém a estrutura para o navegador medir */
            body {
              visibility: hidden !important;
              background: white !important;
            }

            /* Mostra APENAS a folha e tudo dentro dela */
            #folha-a4, #folha-a4 * {
              visibility: visible !important;
            }

            #folha-a4 {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 210mm !important;
              min-height: 297mm !important;
              padding: 0.1cm 1.2cm 1.5cm 1.2cm !important;
              margin: 0 !important;
              box-shadow: none !important;
              background: white !important;
              display: block !important;
            }

            /* Remove qualquer interface que ocupe espaço */
            header, nav, aside, button, .print\\:hidden {
              display: none !important;
            }
            
            /* Garante que o logotipo tenha tamanho físico real */
            img {
              max-width: 100% !important;
            }
          }
        `}} />
      </div>
    </div>
  )
}
