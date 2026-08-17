import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getCleanPublicUrl } from './lib/storage'
import type { Tables } from './supabaseTypes'
import { calculateSesauCompleteness, isNotaModoSesau } from './lib/utils'

type Nota = Tables<'notas'>
type Item = Tables<'itens'>
type HistoricoEntrega = Tables<'historico_entregas'>
type ItemComHistorico = Item & { historico_entregas?: HistoricoEntrega[], marca?: string }
export type NotaComItens = Nota & { 
  itens: ItemComHistorico[]
  entidades?: {
    nome: string
    municipio: string
  } | null
}

const limitStr = (str: string | null | undefined, maxLen: number) => {
  if (!str) return '—'
  return str.length <= maxLen ? str : str.substring(0, maxLen) + '...'
}

const getResolvedName = (n: any) => (n?.entidades?.nome || n?.emissor || '').trim()

const injectCopyrightFooter = (doc: any) => {
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageSize = doc.internal.pageSize
    const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight()
    const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth()

    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.setFont('helvetica', 'normal')
    doc.text("NEXUS CORPORATION - TODOS OS DIREITOS RESERVADOS", pageWidth / 2, pageHeight - 6, { align: 'center' })
  }
}

export type OrdenacaoEmpenhos = 'DATA_ASC' | 'DATA_DESC' | 'COMPLETUDE_DESC' | 'COMPLETUDE_ASC'

function sortNotas(notas: any[], ordenacao: OrdenacaoEmpenhos = 'DATA_ASC') {
  return [...notas].sort((a, b) => {
    const getNotaPct = (nota: any) => {
      let valorEntregue = 0
      if (nota.itens) {
        nota.itens.forEach((i: any) => {
          const qty = (i.historico_entregas || []).reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
          valorEntregue += qty * (Number(i.valor_unitario) || 0)
        })
      }
      return (nota.valor_total_teto || 0) > 0 ? (valorEntregue / nota.valor_total_teto) : 0
    }

    const getTime = (nota: any) => {
      if (!nota.data_emissao) return 0
      const d = new Date(nota.data_emissao)
      return isNaN(d.getTime()) ? 0 : d.getTime()
    }

    if (ordenacao === 'DATA_ASC') {
      return getTime(a) - getTime(b)
    } else if (ordenacao === 'DATA_DESC') {
      return getTime(b) - getTime(a)
    } else if (ordenacao === 'COMPLETUDE_DESC') {
      return getNotaPct(b) - getNotaPct(a)
    } else if (ordenacao === 'COMPLETUDE_ASC') {
      return getNotaPct(a) - getNotaPct(b)
    }
    return 0
  })
}

/**
 * Gera um PDF detalhado de um empenho/nota específica.
 */
export function gerarRelatorioIndividual(nota: NotaComItens) {
  const doc = new jsPDF()

  // --- CABEÇALHO ---
  doc.setFontSize(22)
  doc.setTextColor(29, 29, 31)
  doc.text(`Relatório de Acompanhamento`, 14, 20)
  
  doc.setFontSize(12)
  doc.setTextColor(100)
  doc.text(`Documento: #${nota.numero_ne}`, 14, 28)
  const resolvedEmissor = ((nota as any).entidades?.nome || nota.emissor || 'N/A').trim()
  doc.text(`Emissor: ${resolvedEmissor}`, 14, 34)

  // Badge de Status (retângulo colorido)
  const isConcluido = nota.status_geral === 'CONCLUIDO'
  const statusColor = isConcluido ? [34, 197, 94] : [245, 158, 11] // Emerald-500 : Amber-500
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2])
  doc.roundedRect(160, 15, 35, 10, 2, 2, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.text((nota.status_geral || 'PENDENTE').toUpperCase(), 177.5, 21.5, { align: 'center' })

  // Metadados
  doc.setTextColor(134, 134, 139)
  doc.setFontSize(9)
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 42)

  let finalY = 45

  // --- TABELA DE ITENS ---
  doc.setFontSize(14)
  doc.setTextColor(29, 29, 31)
  doc.text("Detalhamento dos Itens", 14, finalY + 10)

  const rows = (nota.itens || []).map(item => {
    const totalEntregue = item.historico_entregas?.reduce((acc, curr) => acc + (Number(curr.quantidade_entregue) || 0), 0) || 0
    const pendente = (item.quantidade || 0) - totalEntregue
    const statusCompra = item.status_item === 'SOLICITADO' ? 'Compra Solicitada' : 'Pendente'

    const ultimasEntregas = item.historico_entregas
        ?.slice(-3)
        .map(h => {
             const dataFormatada = h.data_entrega ? new Date(h.data_entrega).toLocaleDateString('pt-BR') : 'N/A'
             return `${dataFormatada}: ${h.quantidade_entregue} entregues`
        })
        .join('\n') || 'Nenhuma entrega'

    return [
        `${item.quantidade} ${item.unidade || 'UN'}`,
        item.descricao,
        `${totalEntregue} Enviados\n${pendente} Pendentes`,
        statusCompra,
        ultimasEntregas
    ]
  })

  autoTable(doc, {
    startY: finalY + 15,
    head: [['Qtd/Und', 'Descrição', 'Status Entrega', 'Status Compra', 'Histórico']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9 }, // Slate-800
    styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
    columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 50 },
    }
  })

  // @ts-expect-error: Injeção dinâmica do jspdf-autotable
  finalY = doc.lastAutoTable.finalY + 20

  // --- RODAPÉ ---
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text("Observações Gerais:", 14, finalY)
  doc.setDrawColor(200)
  doc.line(14, finalY + 2, 196, finalY + 2)
  
  const clientNameClean = limitStr(resolvedEmissor, 40)
  const empenhoClean = limitStr(nota.numero_ne || '—', 25)

  const pageCount = doc.getNumberOfPages()
  for(let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Página ${i} de ${pageCount} | Empenho: ${empenhoClean} | Cliente: ${clientNameClean}`, 14, 285)
  }

  injectCopyrightFooter(doc)
  const clientSanitized = resolvedEmissor.replace(/[\s\/\\?%*:|"<>\.]+/g, '_')
  doc.save(`${clientSanitized}_Relatorio_Empenho_${nota.numero_ne}.pdf`)
}

/**
 * Exporta uma lista genérica para Excel.
 */
export function exportToExcel(data: any[], fileName: string) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Relatório")
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

/**
 * Exporta uma lista genérica para PDF (Tabela).
 */
export function exportToPDF(title: string, columns: string[], rows: any[], fileName: string) {
  const doc = new jsPDF({ orientation: 'landscape' })
  
  doc.setFontSize(18)
  doc.text(title, 14, 15)
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22)

  autoTable(doc, {
    startY: 30,
    head: [columns],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [24, 24, 27], textColor: 255, fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 }
  })

  // Encontrar os índices das colunas de Empenho (NE) e Cliente/Órgão
  const neIdx = columns.findIndex(c => {
    const norm = c.toLowerCase()
    return norm.includes('ne') || norm.includes('empenho') || norm.includes('documento')
  })
  const clientIdx = columns.findIndex(c => {
    const norm = c.toLowerCase()
    return norm.includes('cliente') || norm.includes('órgão') || norm.includes('orgao') || norm.includes('emissor')
  })

  const uniqueNEs = neIdx !== -1 
    ? Array.from(new Set(rows.map(r => r[neIdx]).filter(Boolean)))
    : []
  const uniqueClients = clientIdx !== -1 
    ? Array.from(new Set(rows.map(r => r[clientIdx]).filter(Boolean)))
    : []

  const empenhoText = uniqueNEs.length === 1 ? uniqueNEs[0] : (uniqueNEs.length > 1 ? 'Diversos' : '—')
  const clientText = uniqueClients.length === 1 ? uniqueClients[0] : (uniqueClients.length > 1 ? 'Diversos' : '—')

  const empenhoClean = limitStr(empenhoText, 25)
  const clientClean = limitStr(clientText, 40)

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Página ${i} de ${pageCount} | Empenho: ${empenhoClean} | Cliente: ${clientClean}`, 14, 202)
  }

  injectCopyrightFooter(doc)
  doc.save(`${fileName}.pdf`)
}

/**
 * Gera um Relatório de Romaneio (Logística) focado em entrega e conferência.
 * Agrupa itens por Nota de Empenho (NE) para cada cliente selecionado.
 */
export function gerarRomaneioPDF(
  notas: (NotaComItens)[],
  selectedClients: string[],
  selectedNotasIds?: number[],
  options?: { returnDoc?: boolean }
) {
  const doc = new jsPDF({ orientation: 'portrait' })
  
  let filteredNotas = notas as any[]
  
  if (selectedClients && selectedClients.length > 0) {
    filteredNotas = filteredNotas.filter(n => selectedClients.includes(getResolvedName(n)))
  }
  
  if (selectedNotasIds && selectedNotasIds.length > 0) {
    filteredNotas = filteredNotas.filter(n => selectedNotasIds.includes(n.id))
  }
  
  // Se nenhum cliente foi explicitamente selecionado, inferimos a partir das notas resultantes
  let activeClients = selectedClients
  if (!activeClients || activeClients.length === 0) {
    activeClients = Array.from(new Set(filteredNotas.map(n => getResolvedName(n))))
  }
  
  // 1. CABEÇALHO LIMPO E OTIMIZADO PARA IMPRESSÃO (INK-SAVER)
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(1)
  doc.line(14, 12, 196, 12)
  doc.setLineWidth(0.2)
  doc.line(14, 14, 196, 14)
  
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text("ROMANEIO DE ENTREGA E EXPEDIÇÃO", 14, 22)
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 28)
  doc.text(`Total de Clientes no Romaneio: ${activeClients.length}`, 14, 33)

  let finalY = 38
  const empenhosPageMap = new Map<string, { startPage: number; client: string; ne: string }>()
  let grandTotalFinanceiroPendente = 0
  let totalEmpenhosComPendencia = 0
  let totalItensPendentes = 0

  activeClients.forEach((client) => {
    const notasDoCliente = filteredNotas.filter(n => getResolvedName(n) === client)
    if (notasDoCliente.length === 0) return

    if (finalY > 250) {
      doc.addPage()
      finalY = 20
    }

    // 2. HEADER DO CLIENTE (MOLDURA FINA E LEVE EM CINZA)
    doc.setFillColor(250, 252, 255)
    doc.setDrawColor(148, 163, 184)
    doc.setLineWidth(0.5)
    doc.roundedRect(14, finalY, 182, 10, 0.5, 0.5, 'FD')
    
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`CLIENTE: ${client.toUpperCase()}`, 18, finalY + 6.5)
    
    finalY += 15

    notasDoCliente.forEach(n => {
      const pendingItems = (n.itens || []).map((item: any) => {
        const entregas = item.historico_entregas || []
        const entregue = entregas.reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
        const pendente = item.quantidade - entregue
        
        let hasFatorCaixa = entregas.some((h: any) => String(h.motivo_pendencia || '').includes('Fator Caixa'))
        
        const emissorName = String(n.emissor || '').toLowerCase()
        const entidadeNome = String(n.entidades?.nome || '').toLowerCase()
        const entidadeMunicipio = String(n.entidades?.municipio || '').toLowerCase()
        const isNotaTeresina = emissorName.includes('teresina') || 
                               entidadeNome.includes('teresina') || 
                               entidadeMunicipio.includes('teresina')
                               
        if (isNotaTeresina) {
          hasFatorCaixa = false
        }

        const isFinalizado = item.status_item === 'ENTREGUE' || item.status_item === 'CONCLUIDO' || hasFatorCaixa

        return { ...item, pendente, isFinalizado }
      }).filter((item: any) => !item.isFinalizado && item.pendente > 0)

      if (pendingItems.length === 0) return

      if (finalY > 250) {
        doc.addPage()
        finalY = 20
      }

      const currentPage = doc.getNumberOfPages()
      const neKey = String(n.numero_ne || n.id).trim()
      if (!empenhosPageMap.has(neKey)) {
        empenhosPageMap.set(neKey, { startPage: currentPage, client, ne: String(n.numero_ne || '') })
      }

      totalEmpenhosComPendencia++
      totalItensPendentes += pendingItems.length

      // Sub-header da NE com indicação da Página do Romaneio
      doc.setFontSize(8.5)
      doc.setTextColor(71, 85, 105)
      doc.setFont('helvetica', 'bold')
      doc.text(`Nota de Empenho (NE): ${n.numero_ne}   [Pág. ${currentPage} do Romaneio]`, 14, finalY)
      finalY += 4

      const rows = pendingItems.map((item: any) => {
        let desc = item.descricao.toUpperCase()
        if (item.marca) desc += `\nMarca: ${item.marca.toUpperCase()}`
        if (item.status_item === 'SOLICITADO') desc += `\n[ COMPRA SOLICITADA ]`
        const totalItem = item.pendente * (item.valor_unitario || 0)
        return [
          `${item.quantidade} ${item.unidade || 'UN'}`,
          `${item.pendente} ${item.unidade || 'UN'}`,
          desc,
          (item.valor_unitario || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          totalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          '  [   ]'
        ]
      })

      // Linha de total financeiro do empenho (Σ qtd_pendente × valor_unitário)
      const totalFinanceiroPendente = pendingItems.reduce(
        (acc: number, item: any) => acc + item.pendente * (item.valor_unitario || 0),
        0
      )
      grandTotalFinanceiroPendente += totalFinanceiroPendente

      const footerRow = [
        { content: '', styles: { fillColor: [230, 237, 245] } },
        { content: '', styles: { fillColor: [230, 237, 245] } },
        { content: '', styles: { fillColor: [230, 237, 245] } },
        { content: 'TOTAL FINANCEIRO PENDENTE:', styles: { fillColor: [230, 237, 245], fontStyle: 'bold', textColor: [30, 41, 59], halign: 'right' as const } },
        { content: totalFinanceiroPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), styles: { fillColor: [230, 237, 245], fontStyle: 'bold', textColor: [15, 23, 42], halign: 'right' as const } },
        { content: '', styles: { fillColor: [230, 237, 245] } },
      ]

      autoTable(doc, {
        startY: finalY,
        head: [['Qtd. Total', 'Qtd. Pendente', 'Descrição do Item & Marca', 'Valor Unitário', 'Total (R$)', 'Conf.']],
        body: [...rows, footerRow],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 7.5, textColor: 255, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 3, valign: 'middle' },
        columnStyles: {
          0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 24, halign: 'right' },
          4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
          5: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
      })

      // @ts-expect-error dynamic
      finalY = doc.lastAutoTable.finalY + 10
    })

    finalY += 3
  })

  // 2.5 RESUMO DE PENDÊNCIAS DO ROMANEIO (VALOR TOTAL DE PENDÊNCIAS NO FINAL DO RELATÓRIO)
  if (finalY > 225) {
    doc.addPage()
    finalY = 20
  }

  doc.setFillColor(241, 245, 249)
  doc.setDrawColor(71, 85, 105)
  doc.setLineWidth(0.6)
  doc.roundedRect(14, finalY, 182, 22, 1, 1, 'FD')

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text("RESUMO GERAL DE PENDÊNCIAS DO ROMANEIO", 18, finalY + 6.5)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Empenhos com Pendência: ${totalEmpenhosComPendencia}   |   Total de Itens Pendentes: ${totalItensPendentes}`, 18, finalY + 12)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(185, 28, 28)
  doc.text(`VALOR TOTAL DE PENDÊNCIAS (TODOS OS EMPENHOS): ${grandTotalFinanceiroPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 18, finalY + 17.5)

  finalY += 28

  // 3. CAMPO DE ASSINATURAS (OTIMIZADO)
  if (finalY > 235) {
    doc.addPage()
    finalY = 20
  }
  
  doc.setDrawColor(200)
  doc.setLineWidth(0.5)
  doc.line(14, finalY + 22, 90, finalY + 22)
  doc.setFontSize(8)
  doc.setTextColor(100)
  doc.text("Assinatura Responsável (Expedição)", 14, finalY + 26)
  
  doc.line(120, finalY + 22, 196, finalY + 22)
  doc.text("Assinatura Motorista/Transportador", 120, finalY + 26)

  const uniqueClients = Array.from(new Set(filteredNotas.map(n => getResolvedName(n)).filter(Boolean)))
  const uniqueNEs = Array.from(new Set(filteredNotas.map(n => n.numero_ne).filter(Boolean)))

  const empenhoText = uniqueNEs.length === 1 ? uniqueNEs[0] : (uniqueNEs.length > 1 ? 'Diversos' : '—')
  const clientText = uniqueClients.length === 1 ? uniqueClients[0] : (uniqueClients.length > 1 ? 'Diversos' : '—')

  const empenhoClean = limitStr(empenhoText, 25)
  const clientClean = limitStr(clientText, 40)

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Página ${i} de ${pageCount} | Empenho: ${empenhoClean} | Cliente: ${clientClean}`, 14, 285)
  }

  injectCopyrightFooter(doc)

  if (options?.returnDoc) {
    return {
      doc,
      empenhosPageMap,
      grandTotalFinanceiroPendente,
      totalEmpenhosComPendencia,
      totalItensPendentes
    }
  }

  const clientSanitized = clientText.replace(/[\s\/\\?%*:|"<>\.]+/g, '_')
  doc.save(`${clientSanitized}_Romaneio_${new Date().toISOString().split('T')[0]}.pdf`)
}

/**
 * Compila o Relatório de Romaneio + Arquivos PDF Originais dos Empenhos Selecionados.
 * Acrescenta em cada página do empenho original uma tarja/cabeçalho indicando a página do Romaneio onde ele se encontra.
 */
export async function gerarRomaneioComEmpenhosPDF(
  notas: (NotaComItens)[],
  selectedClients: string[],
  selectedNotasIds?: number[]
): Promise<{ success: boolean; totalArquivos: number; totalEmpenhosSemPdf: number; message?: string }> {
  try {
    const result = gerarRomaneioPDF(notas, selectedClients, selectedNotasIds, { returnDoc: true })
    if (!result) {
      return { success: false, totalArquivos: 0, totalEmpenhosSemPdf: 0, message: 'Não foi possível gerar o Romaneio.' }
    }

    const { doc, empenhosPageMap } = result
    const romaneioPdfBytes = doc.output('arraybuffer')

    const mergedPdf = await PDFDocument.create()
    const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold)

    // 1. Copia todas as páginas do Romaneio PDF para o PDF final compilado
    const romaneioDoc = await PDFDocument.load(romaneioPdfBytes)
    const romaneioPages = await mergedPdf.copyPages(romaneioDoc, romaneioDoc.getPageIndices())
    romaneioPages.forEach((page) => mergedPdf.addPage(page))

    const romaneioTotalPages = romaneioDoc.getPageCount()

    // 2. Filtra as notas selecionadas que foram incluídas no Romaneio
    let filteredNotas = notas as any[]
    if (selectedClients && selectedClients.length > 0) {
      filteredNotas = filteredNotas.filter(n => selectedClients.includes(getResolvedName(n)))
    }
    if (selectedNotasIds && selectedNotasIds.length > 0) {
      filteredNotas = filteredNotas.filter(n => selectedNotasIds.includes(n.id))
    }

    // 3. Para cada nota com arquivo PDF original anexado, carrega e estampa o cabeçalho
    let totalArquivosAnexados = 0
    let totalEmpenhosSemPdf = 0

    for (const nota of filteredNotas) {
      const neKey = String(nota.numero_ne || nota.id).trim()
      const romaneioInfo = empenhosPageMap.get(neKey)
      const romaneioPageNum = romaneioInfo ? romaneioInfo.startPage : 1

      const rawPath = nota.arquivo_caminho
      if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
        totalEmpenhosSemPdf++
        continue
      }

      try {
        const url = rawPath.startsWith('http') ? rawPath : getCleanPublicUrl(rawPath.trim())
        const response = await fetch(url)
        if (!response.ok) {
          totalEmpenhosSemPdf++
          continue
        }

        const contentType = response.headers.get('content-type') || ''
        const arrayBuffer = await response.arrayBuffer()

        if (contentType.includes('image/') || rawPath.match(/\.(png|jpg|jpeg|webp)$/i)) {
          const isPng = rawPath.endsWith('.png') || contentType.includes('image/png')
          const img = isPng ? await mergedPdf.embedPng(arrayBuffer) : await mergedPdf.embedJpg(arrayBuffer)
          const page = mergedPdf.addPage([595.28, 841.89]) // A4
          const { width, height } = img.scaleToFit(550, 780)
          
          page.drawImage(img, {
            x: (595.28 - width) / 2,
            y: (841.89 - height - 30) / 2,
            width,
            height
          })

          // Tarja superior no PDF do empenho indicando a localização no Romaneio
          page.drawRectangle({
            x: 0,
            y: 815,
            width: 595.28,
            height: 26.89,
            color: rgb(0.12, 0.16, 0.23) // Slate 900
          })

          page.drawText(`EMPENHO NE: ${nota.numero_ne || 'Sem nº'}   |   LOCALIZAÇÃO NO ROMANEIO: PÁGINA ${romaneioPageNum} DE ${romaneioTotalPages}`, {
            x: 15,
            y: 824,
            size: 9,
            font: fontBold,
            color: rgb(1, 1, 1)
          })

          totalArquivosAnexados++
        } else {
          // É um PDF original do Empenho
          const empPdf = await PDFDocument.load(arrayBuffer)
          const empPages = await mergedPdf.copyPages(empPdf, empPdf.getPageIndices())

          empPages.forEach((page, pIdx) => {
            const pageSize = page.getSize()
            
            // Tarja superior no PDF do empenho indicando a localização no Romaneio
            page.drawRectangle({
              x: 0,
              y: pageSize.height - 24,
              width: pageSize.width,
              height: 24,
              color: rgb(0.12, 0.16, 0.23) // Slate 900
            })

            page.drawText(`EMPENHO NE: ${nota.numero_ne || 'Sem nº'}   |   LOCALIZAÇÃO NO ROMANEIO: PÁGINA ${romaneioPageNum} DE ${romaneioTotalPages}   (Empenho Original Pág. ${pIdx + 1}/${empPages.length})`, {
              x: 12,
              y: pageSize.height - 16,
              size: 8,
              font: fontBold,
              color: rgb(1, 1, 1)
            })

            mergedPdf.addPage(page)
          })

          totalArquivosAnexados++
        }
      } catch (fileErr) {
        console.warn(`[Romaneio+Empenhos] Erro ao anexar PDF da NE ${nota.numero_ne}:`, fileErr)
        totalEmpenhosSemPdf++
      }
    }

    const mergedBytes = await mergedPdf.save()
    const blob = new Blob([mergedBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
    const pdfUrl = URL.createObjectURL(blob)

    // Baixa o arquivo PDF compilado
    const clientText = selectedClients.length === 1 ? selectedClients[0] : 'Consolidado'
    const clientSanitized = clientText.replace(/[\s\/\\?%*:|"<>\.]+/g, '_')
    const fileName = `${clientSanitized}_Romaneio_com_Empenhos_${new Date().toISOString().split('T')[0]}.pdf`

    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Abre em nova janela para visualização / impressão
    window.open(pdfUrl, '_blank')

    return {
      success: true,
      totalArquivos: totalArquivosAnexados,
      totalEmpenhosSemPdf
    }
  } catch (err: any) {
    console.error('Erro ao gerar Romaneio com Empenhos:', err)
    return {
      success: false,
      totalArquivos: 0,
      totalEmpenhosSemPdf: 0,
      message: err.message || 'Erro ao gerar PDF compilado.'
    }
  }
}

/**
 * Gera um relatório premium da situação atual de todos os empenhos de um cliente.
 * Inclui barras de progresso desenhadas no PDF e detalhamento linha a linha do histórico de entregas.
 */
export function gerarRelatorioSituacaoClientePDF(
  clienteNome: string,
  todasNotas: any[],
  selectedNotasIds?: number[],
  isSesauReport = false,
  ordenacao: OrdenacaoEmpenhos = 'DATA_ASC'
) {
  const doc = new jsPDF({ orientation: 'portrait' })
  
  let matchingNotas = todasNotas
  
  if (clienteNome) {
    matchingNotas = matchingNotas.filter(n => getResolvedName(n) === clienteNome)
  }
  
  if (selectedNotasIds && selectedNotasIds.length > 0) {
    matchingNotas = matchingNotas.filter(n => selectedNotasIds.includes(n.id))
  }
  
  if (isSesauReport) {
    matchingNotas = matchingNotas.filter(n => isNotaModoSesau(n))
  }
  
  if (matchingNotas.length === 0) return

  // Ordenar conforme parâmetro selecionado
  matchingNotas = sortNotas(matchingNotas, ordenacao)

  // 1. HEADER LIMPO E ELEGANTE (OTIMIZADO PARA IMPRESSÃO EM PRETO E BRANCO - INK SAVER)
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(1)
  doc.line(14, 12, 196, 12)
  doc.setLineWidth(0.2)
  doc.line(14, 14, 196, 14)

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(isSesauReport ? "SITUAÇÃO DE EMPENHOS E COMPLETUDE SESAU" : "SITUAÇÃO DE EMPENHOS E PRESTAÇÃO DE CONTAS", 14, 22)
  
  const displayCliente = isSesauReport ? "FUNDO ESTADUAL DE SAÚDE DO TOCANTINS (SESAU)" : (clienteNome || 'DIVERSOS')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`CLIENTE: ${displayCliente.toUpperCase()}`, 14, 28)
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(isSesauReport 
    ? `Balanço Geral de Completude SESAU-TO | Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`
    : `Relatório Consolidado Oficial | Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 34)

  let totalGeral = 0
  let totalItensGlobais = 0
  let totalEntregueGlobal = 0
  let totalFinanceiroEntregue = 0

  matchingNotas.forEach(n => {
    totalGeral += (n.valor_total_teto || 0)
    if (n.itens) {
      n.itens.forEach((i: any) => {
        totalItensGlobais += i.quantidade
        const entregue = (i.historico_entregas || []).reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
        totalEntregueGlobal += entregue
        totalFinanceiroEntregue += entregue * (i.valor_unitario || 0)
      })
    }
  })

  const totalFinanceiroPendente = totalGeral - totalFinanceiroEntregue
  const progressoGlobalQtd = totalItensGlobais > 0 ? Math.round((totalEntregueGlobal / totalItensGlobais) * 100) : 0
  const progressoGlobalFin = totalGeral > 0 ? Math.round((totalFinanceiroEntregue / totalGeral) * 100) : 0

  // 2. CARD DE RESUMO GLOBAL CONSOLIDADO (OTIMIZADO PARA PRETO E BRANCO)
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.5)
  doc.setFillColor(250, 252, 255) // cinza-azul bem claro e limpo
  doc.roundedRect(14, 38, 182, 30, 1, 1, 'FD')

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text("RESUMO CONSOLIDADO DO CLIENTE", 18, 44)

  doc.setDrawColor(226, 232, 240)
  doc.line(18, 46, 192, 46)

  // Coluna 1: Dados Financeiros
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text("AUTORIZADO (TETO):", 18, 52)
  doc.text("ENTREGUE ACUMULADO:", 18, 57)
  doc.text("SALDO A ENTREGAR:", 18, 62)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 60, 52)
  doc.text(totalFinanceiroEntregue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 60, 57)
  doc.text(totalFinanceiroPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 60, 62)

  // Coluna 2: Dados Logísticos (Recuado ligeiramente para a esquerda para evitar sobreposições)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text("QTD AUTORIZADA:", 106, 52)
  doc.text("QTD ENTREGUE:", 106, 57)
  doc.text("SALDO QTD PENDENTE:", 106, 62)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${totalItensGlobais} und`, 140, 52)
  doc.text(`${totalEntregueGlobal} und (${progressoGlobalQtd}%)`, 140, 57)
  doc.text(`${totalItensGlobais - totalEntregueGlobal} und`, 140, 62)

  // Coluna 3: Progresso Geral (Afastado para a direita, muito mais fino e cor suave)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`EXECUÇÃO: ${progressoGlobalFin}%`, 164, 52)

  const trackW = 28 // Um pouco menor para encaixar perfeitamente
  const trackH = 1.8 // Fino e discreto
  const trackX = 164
  const trackY = 55.5 // Centralizado verticalmente no meio da segunda linha de dados

  doc.setFillColor(241, 245, 249)
  doc.roundedRect(trackX, trackY, trackW, trackH, 0.4, 0.4, 'F')
  
  if (progressoGlobalFin > 0) {
    doc.setFillColor(100, 110, 120) // Cinza-slate suave, elegante e perfeito para B&W
    const cappedFin = Math.min(100, progressoGlobalFin) // Nunca ultrapassa o limite da barra!
    const fillW = (cappedFin / 100) * trackW
    doc.roundedRect(trackX, trackY, fillW, trackH, 0.4, 0.4, 'F')
  }

  let finalY = 74

  matchingNotas.forEach((nota) => {
    if (finalY > 240) {
      doc.addPage()
      finalY = 20
    }

    // Calcular valores do Empenho específico
    let valorEntregueNota = 0
    if (nota.itens) {
      nota.itens.forEach((i: any) => {
        const entregadoQty = (i.historico_entregas || []).reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
        valorEntregueNota += entregadoQty * (i.valor_unitario || 0)
      })
    }

    // 3. CABEÇALHO DO EMPENHO (NE) - PRETO E BRANCO HIGHLIGHT
    doc.setFillColor(245, 247, 250) // cinza-azul claro
    doc.setDrawColor(148, 163, 184)
    doc.roundedRect(14, finalY, 182, 12, 0.5, 0.5, 'FD')
    
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`EMPENHO (NE): ${nota.numero_ne}`, 18, finalY + 7.5)
    
    doc.setFont('helvetica', 'normal')
    doc.text(`Teto: ${nota.valor_total_teto?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00'} | Entregue: ${valorEntregueNota.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 68, finalY + 7.5)
    
    // Status visual B&W Pill
    let statusLabel = (nota.status_geral || 'PENDENTE').replace('_', ' ').toUpperCase()
    if (isSesauReport || isNotaModoSesau(nota)) {
      let totalPedidoValor = 0
      let totalEntregueValor = 0
      if (nota.itens) {
        nota.itens.forEach((i: any) => {
          const pedido = Number(i.quantidade) || 0
          const unit = Number(i.valor_unitario) || 0
          const entregas = i.historico_entregas || []
          const entregue = entregas.reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
          
          let isFatorCaixa = entregas.some((h: any) => String(h.motivo_pendencia || '').includes('Fator Caixa'))
          const emissorName = String(nota.emissor || '').toLowerCase()
          const entidadeNome = String(nota.entidades?.nome || '').toLowerCase()
          const entidadeMunicipio = String(nota.entidades?.municipio || '').toLowerCase()
          const isNotaTeresina = emissorName.includes('teresina') || 
                                 entidadeNome.includes('teresina') || 
                                 entidadeMunicipio.includes('teresina')
          if (isNotaTeresina) isFatorCaixa = false

          let entregueConsiderado = entregue
          if (isFatorCaixa) {
            entregueConsiderado = pedido
          }

          totalPedidoValor += pedido * unit
          totalEntregueValor += entregueConsiderado * unit
        })
      }
      const percent = totalPedidoValor > 0 ? Math.floor((totalEntregueValor / totalPedidoValor) * 100) : 0
      const sesauTag = calculateSesauCompleteness(nota.itens, percent)
      const sesauLabels = {
        'SIM': 'SIM',
        'SIM_CONCLUIDA': 'SIM / CONCLUÍDA',
        'NAO': 'NÃO',
        'NAO_CONCLUIDA': 'NÃO / CONCLUÍDA'
      }
      statusLabel = sesauLabels[sesauTag] || 'NÃO'
    }

    doc.setDrawColor(148, 163, 184)
    doc.setFillColor(255, 255, 255)
    const pillW = (isSesauReport || isNotaModoSesau(nota)) ? 38 : 33
    const pillX = (isSesauReport || isNotaModoSesau(nota)) ? 153 : 158
    doc.roundedRect(pillX, finalY + 2.5, pillW, 7, 0.5, 0.5, 'FD')
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(6)
    doc.setFont('helvetica', 'bold')
    doc.text(statusLabel, pillX + pillW/2, finalY + 7.2, { align: 'center' })

    finalY += 14 // Espaço abaixo do card do empenho

    // 4. DETALHAMENTO DE ITENS DO EMPENHO
    const rows = (nota.itens || []).map((item: any) => {
      const entregas = item.historico_entregas || []
      const entregue = entregas.reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
      const pendenteRaw = item.quantidade - entregue
      const pct = Math.min(100, Math.round((entregue / item.quantidade) * 100))

      // 1. Column 1: Item / Descrição
      let descText = `${item.descricao.toUpperCase()}`
      if (item.marca) {
        descText += `\nMARCA: ${item.marca.toUpperCase()}`
      }
      if (item.status_item === 'SOLICITADO') {
        descText += `\n[ COMPRA SOLICITADA ]`
      }
      if (entregas.length > 0) {
        descText += `\n\n[ HISTÓRICO DE ENTREGAS ]`
        
        // Ordenar entregas de forma ascendente cronologicamente
        const sortedEntregas = [...entregas].sort((a, b) => {
          const dateA = new Date(a.data_emissao_nf || a.data_entrega || 0).getTime()
          const dateB = new Date(b.data_emissao_nf || b.data_entrega || 0).getTime()
          return dateA - dateB
        })

        let currentSum = 0
        const entregasComStatus = sortedEntregas.map((h: any) => {
          currentSum += (Number(h.quantidade_entregue) || 0)
          let sobrebaixaQtd = 0
          if (currentSum > item.quantidade) {
            sobrebaixaQtd = Math.min(Number(h.quantidade_entregue), currentSum - item.quantidade)
          }
          return { ...h, sobrebaixaQtd }
        })

        entregasComStatus.forEach((h: any) => {
          let dateStr = h.data_emissao_nf || h.data_entrega
          let dt = 's/ data'
          if (dateStr) {
            const d = new Date(dateStr)
            if (!isNaN(d.getTime())) {
              dt = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
              if (dateStr.includes('T')) dt = new Date(dateStr).toLocaleDateString('pt-BR')
            }
          }
          const numUpper = String(h.numero_nf || '').toUpperCase()
          const isPedidoDoc = numUpper.includes('PEDIDO') || numUpper.includes('DAV') || numUpper.includes('PROVISÓRIA') || numUpper.includes('PROVISORIA')
          const nf = h.numero_nf 
            ? (isPedidoDoc ? h.numero_nf : `NF: ${h.numero_nf}`)
            : 'Sem NF'
          const mot = h.motivo_pendencia ? ` | Motivo: ${h.motivo_pendencia}` : ''
          const sobrebaixaText = h.sobrebaixaQtd > 0 ? ` | SOBREBAIXA: +${h.sobrebaixaQtd} und` : ''
          descText += `\n- Enviado ${h.quantidade_entregue} und em ${dt} (${nf}${mot}${sobrebaixaText})`
        })
      } else {
        descText += `\n\n[ AGUARDANDO PROGRAMAÇÃO DE LOGÍSTICA ]`
      }

      // 2. Column 2: Qtd / Und
      const qtyText = `${item.quantidade}\n${item.unidade || 'UN'}`

      // 3. Column 3: Unitário / Total
      const unitVal = item.valor_unitario || 0
      const totalVal = item.quantidade * unitVal
      const valText = `${unitVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n${totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`

      // 4. Column 4: Entregue / Pendente
      const pendText = `Enviado: ${entregue} und\nPendente: ${pendenteRaw} und`

      // 5. Column 5: Saldo Restante e Progress Bar
      const saldoFin = pendenteRaw * unitVal
      const saldoFinText = `${saldoFin.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n\n`

      return [
        descText,
        qtyText,
        valText,
        pendText,
        { content: saldoFinText, _pct: pct }
      ]
    })

    autoTable(doc, {
      startY: finalY,
      head: [['Descrição do Item & Histórico de Notas', 'Qtd / Und', 'Unitário / Total', 'Entregue / Pendente', 'Saldo Rest. / Status']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], fontSize: 7.5, textColor: 255, halign: 'center' },
      styles: { fontSize: 7, cellPadding: 3, valign: 'top', overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 32, halign: 'left' },
        4: { cellWidth: 26, halign: 'center' }
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = data.cell.raw as any
          const pct = raw._pct
          const cellX = data.cell.x
          const cellY = data.cell.y
          const cellW = data.cell.width
          const cellH = data.cell.height

          doc.setFontSize(6)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(100)
          doc.text(`${pct}% exec.`, cellX + cellW/2, cellY + cellH - 7, { align: 'center' })

          const barW = cellW - 6
          const barH = 1.0 // Fina e elegante
          const barX = cellX + 3
          const barY = cellY + cellH - 3.5 // Ajustado para ficar na margem inferior perfeitamente
 
          doc.setFillColor(226, 232, 240)
          doc.roundedRect(barX, barY, barW, barH, 0.3, 0.3, 'F')
 
          if (pct > 0) {
            const fillW = (pct / 100) * barW
            doc.setFillColor(100, 110, 120) // Cinza-slate suave em vez de preto sólido
            doc.roundedRect(barX, barY, fillW, barH, 0.3, 0.3, 'F')
          }
        }
      }
    })

    // @ts-expect-error dynamic
    finalY = doc.lastAutoTable.finalY + 12
  })

  // 5. RODAPÉ INSTITUCIONAL (OTIMIZADO)
  const uniqueClients = Array.from(new Set(matchingNotas.map(n => getResolvedName(n)).filter(Boolean)))
  const uniqueNEs = Array.from(new Set(matchingNotas.map(n => n.numero_ne).filter(Boolean)))
  const empenhoText = uniqueNEs.length === 1 ? uniqueNEs[0] : (uniqueNEs.length > 1 ? 'Diversos' : '—')
  const clientText = uniqueClients.length === 1 ? uniqueClients[0] : (uniqueClients.length > 1 ? 'Diversos' : '—')
  const empenhoClean = limitStr(empenhoText, 25)
  const clientClean = limitStr(clientText, 40)

  const pageCount = doc.getNumberOfPages()
  for(let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Página ${i} de ${pageCount} | Empenho: ${empenhoClean} | Cliente: ${clientClean}`, 14, 285)
  }

  injectCopyrightFooter(doc)
  const clientSanitized = clienteNome.replace(/[\s\/\\?%*:|"<>\.]+/g, '_')
  doc.save(`${clientSanitized}_Situacao_${new Date().toISOString().split('T')[0]}.pdf`)
}

/**
 * Relatório Geral de Empenhos com design premium e suporte a detalhamento de itens.
 */
export function gerarRelatorioGeralPremiumPDF(
  notas: (Nota & { itens: Item[] })[], 
  incluirItens: boolean = false
) {
  const doc = new jsPDF({ orientation: 'landscape' })
  
  // Design Header
  doc.setFillColor(37, 99, 235) // Blue-600
  doc.rect(0, 0, 297, 30, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.text("RELATÓRIO GERENCIAL DE EMPENHOS", 14, 18)
  
  doc.setFontSize(10)
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 25)

  // Resumo Financeiro
  const totalGeral = notas.reduce((acc, n) => acc + (n.valor_total_teto || 0), 0)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(210, 5, 75, 20, 2, 2, 'F')
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(9)
  doc.text("VALOR TOTAL ACUMULADO:", 215, 12)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 215, 20)

  const rows: any[] = []
  notas.forEach(n => {
    rows.push([
      n.numero_ne,
      ((n as any).entidades?.nome || n.emissor || '—').trim(),
      n.data_emissao ? new Date(n.data_emissao).toLocaleDateString('pt-BR') : '—',
      (n.status_geral || 'PENDENTE').toUpperCase(),
      n.valor_total_teto?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '—'
    ])

    if (incluirItens && n.itens && n.itens.length > 0) {
      const itensStr = n.itens.map(i => `• ${i.quantidade} ${i.unidade || 'UN'} - ${i.descricao}`).join('\n')
      rows.push([{ content: itensStr, colSpan: 5, styles: { fillColor: [249, 250, 251], fontSize: 7, textColor: [100, 116, 139] } }])
    }
  })

  autoTable(doc, {
    startY: 40,
    head: [['Nº da NE', 'Órgão / Cliente', 'Data Emissão', 'Status', 'Valor Teto']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
        4: { halign: 'right', fontStyle: 'bold' }
    }
  })

  const uniqueClientsGeral = Array.from(new Set(notas.map(n => getResolvedName(n)).filter(Boolean)))
  const uniqueNEsGeral = Array.from(new Set(notas.map(n => n.numero_ne).filter(Boolean)))
  const empenhoTextGeral = uniqueNEsGeral.length === 1 ? uniqueNEsGeral[0] : (uniqueNEsGeral.length > 1 ? 'Diversos' : '—')
  const clientTextGeral = uniqueClientsGeral.length === 1 ? uniqueClientsGeral[0] : (uniqueClientsGeral.length > 1 ? 'Diversos' : '—')
  const empenhoCleanGeral = limitStr(empenhoTextGeral, 25)
  const clientCleanGeral = limitStr(clientTextGeral, 40)

  const pageCountGeral = doc.getNumberOfPages()
  for(let i = 1; i <= pageCountGeral; i++) {
    doc.setPage(i)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Página ${i} de ${pageCountGeral} | Empenho: ${empenhoCleanGeral} | Cliente: ${clientCleanGeral}`, 14, 202)
  }

  injectCopyrightFooter(doc)
  doc.save(`Relatorio_Empenhos_Premium_${new Date().toISOString().split('T')[0]}.pdf`)
}

/**
 * Gera o Relatório de Situação de Empenhos SIMPLIFICADO (sem detalhamento por item).
 * Mantém o mesmo cabeçalho e card consolidado de KPIs (Teto, Entregue, Saldo, Qtd Autorizada, Qtd Entregue, % Execução, Saldo Qtd Pendente).
 * Exibe a lista de empenhos com valores totais, saldos, status e a relação de todas as NFs lançadas para cada empenho.
 */
export function gerarRelatorioSituacaoClienteSimplificadoPDF(
  clienteNome: string,
  todasNotas: any[],
  selectedNotasIds?: number[],
  ordenacao: OrdenacaoEmpenhos = 'DATA_ASC'
) {
  const doc = new jsPDF({ orientation: 'portrait' })
  
  let matchingNotas = todasNotas
  
  if (clienteNome) {
    matchingNotas = matchingNotas.filter(n => getResolvedName(n) === clienteNome)
  }
  
  if (selectedNotasIds && selectedNotasIds.length > 0) {
    matchingNotas = matchingNotas.filter(n => selectedNotasIds.includes(n.id))
  }

  if (matchingNotas.length === 0) return

  // Ordenar conforme parâmetro selecionado (Data ASC/DESC ou Completude DESC/ASC)
  matchingNotas = sortNotas(matchingNotas, ordenacao)

  // 1. CABEÇALHO LIMPO E ELEGANTE (OTIMIZADO PARA IMPRESSÃO EM PRETO E BRANCO)
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(1)
  doc.line(14, 12, 196, 12)
  doc.setLineWidth(0.2)
  doc.line(14, 14, 196, 14)

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text("SITUAÇÃO DE EMPENHOS (SIMPLIFICADO)", 14, 22)
  
  const displayCliente = clienteNome || 'DIVERSOS'
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`CLIENTE: ${displayCliente.toUpperCase()}`, 14, 28)
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(`Relatório Consolidado Simplificado Oficial | Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 34)

  // 2. CÁLCULO DE TOTAIS GLOBAIS PARA O CARD DE RESUMO (IGUAL AO DETALHADO)
  let totalGeral = 0
  let totalItensGlobais = 0
  let totalEntregueGlobal = 0
  let totalFinanceiroEntregue = 0

  matchingNotas.forEach(n => {
    totalGeral += (n.valor_total_teto || 0)
    if (n.itens) {
      n.itens.forEach((i: any) => {
        totalItensGlobais += Number(i.quantidade) || 0
        const entregue = (i.historico_entregas || []).reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)
        totalEntregueGlobal += entregue
        totalFinanceiroEntregue += entregue * (Number(i.valor_unitario) || 0)
      })
    }
  })

  const totalFinanceiroPendente = totalGeral - totalFinanceiroEntregue
  const progressoGlobalQtd = totalItensGlobais > 0 ? Math.round((totalEntregueGlobal / totalItensGlobais) * 100) : 0
  const progressoGlobalFin = totalGeral > 0 ? Math.round((totalFinanceiroEntregue / totalGeral) * 100) : 0

  // CARD DE RESUMO CONSOLIDADO (MESMA ESTRUTURA E GEOMETRIA DO DETALHADO)
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.5)
  doc.setFillColor(250, 252, 255)
  doc.roundedRect(14, 38, 182, 30, 1, 1, 'FD')

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text("RESUMO CONSOLIDADO DO CLIENTE", 18, 44)

  doc.setDrawColor(226, 232, 240)
  doc.line(18, 46, 192, 46)

  // Coluna 1: Dados Financeiros
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text("AUTORIZADO (TETO):", 18, 52)
  doc.text("ENTREGUE ACUMULADO:", 18, 57)
  doc.text("SALDO A ENTREGAR:", 18, 62)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 60, 52)
  doc.text(totalFinanceiroEntregue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 60, 57)
  doc.text(totalFinanceiroPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 60, 62)

  // Coluna 2: Dados Logísticos
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text("QTD AUTORIZADA:", 106, 52)
  doc.text("QTD ENTREGUE:", 106, 57)
  doc.text("SALDO QTD PENDENTE:", 106, 62)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${totalItensGlobais} und`, 140, 52)
  doc.text(`${totalEntregueGlobal} und (${progressoGlobalQtd}%)`, 140, 57)
  doc.text(`${totalItensGlobais - totalEntregueGlobal} und`, 140, 62)

  // Coluna 3: Progresso Geral
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`EXECUÇÃO: ${progressoGlobalFin}%`, 164, 52)

  const trackW = 28
  const trackH = 1.8
  const trackX = 164
  const trackY = 55.5

  doc.setFillColor(241, 245, 249)
  doc.roundedRect(trackX, trackY, trackW, trackH, 0.4, 0.4, 'F')
  
  if (progressoGlobalFin > 0) {
    doc.setFillColor(100, 110, 120)
    const cappedFin = Math.min(100, progressoGlobalFin)
    const fillW = (cappedFin / 100) * trackW
    doc.roundedRect(trackX, trackY, fillW, trackH, 0.4, 0.4, 'F')
  }

  // 3. TABELA DE EMPENHOS (SEM ITENS, COM LISTA DE NFs VINCULADAS)
  const tableRows: any[] = []

  matchingNotas.forEach(nota => {
    let valorEntregueNota = 0
    const nfMap = new Map<string, { numero: string, data: string, valor: number }>()

    if (nota.itens) {
      nota.itens.forEach((i: any) => {
        const unit = Number(i.valor_unitario) || 0
        const entregas = i.historico_entregas || []
        
        entregas.forEach((h: any) => {
          const qty = Number(h.quantidade_entregue) || 0
          const val = qty * unit
          valorEntregueNota += val

          const numRaw = String(h.numero_nf || '').trim()
          const numKey = numRaw || 'SEM_NF'
          
          let dateStr = h.data_emissao_nf || h.data_entrega
          let dt = 's/ data'
          if (dateStr) {
            const d = new Date(dateStr)
            if (!isNaN(d.getTime())) {
              dt = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
              if (dateStr.includes('T')) dt = new Date(dateStr).toLocaleDateString('pt-BR')
            }
          }

          if (nfMap.has(numKey)) {
            const existing = nfMap.get(numKey)!
            existing.valor += val
          } else {
            const numUpper = numRaw.toUpperCase()
            const isPedidoDoc = numUpper.includes('PEDIDO') || numUpper.includes('DAV') || numUpper.includes('PROVISÓRIA') || numUpper.includes('PROVISORIA')
            const displayNum = numRaw ? (isPedidoDoc ? numRaw : `NF ${numRaw}`) : 'Sem NF'
            nfMap.set(numKey, {
              numero: displayNum,
              data: dt,
              valor: val
            })
          }
        })
      })
    }

    const valorPendenteNota = (nota.valor_total_teto || 0) - valorEntregueNota
    const pctNota = (nota.valor_total_teto || 0) > 0 ? Math.min(100, Math.round((valorEntregueNota / nota.valor_total_teto) * 100)) : 0

    const nfsList = Array.from(nfMap.values())
    let nfsFormatted = 'Nenhuma NF vinculada'
    if (nfsList.length > 0) {
      nfsFormatted = nfsList.map(nf => {
        return `• ${nf.numero} (${nf.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} - ${nf.data})`
      }).join('\n')
    }

    const emissorOuCliente = getResolvedName(nota) || 'DESCONHECIDO'
    const dataEmissaoStr = nota.data_emissao ? new Date(nota.data_emissao).toLocaleDateString('pt-BR') : '—'
    const statusStr = (nota.status_geral || 'PENDENTE').replace('_', ' ').toUpperCase()

    const docText = `NE: ${nota.numero_ne || 'Sem nº'}\nEmissão: ${dataEmissaoStr}\nStatus: ${statusStr}`
    const clienteText = emissorOuCliente
    const tetoText = (nota.valor_total_teto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const entregueText = valorEntregueNota.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const saldoText = `${valorPendenteNota.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n(${pctNota}% exec.)`

    tableRows.push([
      docText,
      clienteText,
      tetoText,
      entregueText,
      saldoText,
      nfsFormatted
    ])
  })

  autoTable(doc, {
    startY: 74,
    head: [['Documento (NE)', 'Cliente / Órgão', 'Valor Teto', 'Valor Entregue', 'Saldo Pendente', 'NFs Lançadas / Vinculadas']],
    body: tableRows,
    theme: 'striped',
    headStyles: { 
      fillColor: [30, 41, 59], 
      textColor: 255, 
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 2.5,
      halign: 'left' 
    },
    styles: { 
      fontSize: 7, 
      cellPadding: 2.5, 
      valign: 'top',
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 32 },
      2: { cellWidth: 29, halign: 'right' },
      3: { cellWidth: 29, halign: 'right' },
      4: { cellWidth: 29, halign: 'right' },
      5: { cellWidth: 35 }
    },
    foot: [[
      'TOTAL GERAL',
      `${matchingNotas.length} empenho(s)`,
      totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      totalFinanceiroEntregue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      totalFinanceiroPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      `Execução: ${progressoGlobalFin}%`
    ]],
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: 2
    }
  })

  const uniqueClients = Array.from(new Set(matchingNotas.map(n => getResolvedName(n)).filter(Boolean)))
  const clientText = uniqueClients.length === 1 ? uniqueClients[0] : 'Diversos'

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(100)
    doc.text(`Página ${i} de ${pageCount} | Relatório de Situação Simplificado | Cliente: ${limitStr(clientText, 40)}`, 14, 285)
  }

  injectCopyrightFooter(doc)
  doc.save(`Relatorio_Situacao_Simplificado_${new Date().toISOString().split('T')[0]}.pdf`)
}

/**
 * Gera o Relatório de Compilação de Notas Fiscais e DAVs dos Empenhos Selecionados.
 * Agrupa todas as NFs lançadas por empenho, com detalhamento de itens, quantidades, valores e totais.
 */
export function gerarRelatorioCompilacaoNFsPDF(
  clienteNome: string,
  todasNotas: any[],
  selectedNotasIds?: number[],
  ordenacao: OrdenacaoEmpenhos = 'DATA_ASC'
) {
  const doc = new jsPDF({ orientation: 'portrait' })
  
  let matchingNotas = todasNotas
  
  if (clienteNome) {
    matchingNotas = matchingNotas.filter(n => getResolvedName(n) === clienteNome)
  }
  
  if (selectedNotasIds && selectedNotasIds.length > 0) {
    matchingNotas = matchingNotas.filter(n => selectedNotasIds.includes(n.id))
  }

  if (matchingNotas.length === 0) return

  // Ordenar notas conforme preferência do usuário
  matchingNotas = sortNotas(matchingNotas, ordenacao)

  // 1. CABEÇALHO DEDICADO
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(1)
  doc.line(14, 12, 196, 12)
  doc.setLineWidth(0.2)
  doc.line(14, 14, 196, 14)

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text("COMPILAÇÃO DE NOTAS FISCAIS E DAVS POR EMPENHO", 14, 22)
  
  const displayCliente = clienteNome || 'DIVERSOS'
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`CLIENTE / ÓRGÃO: ${displayCliente.toUpperCase()}`, 14, 28)
  
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(`Relatório Oficial de Comprovantes de Entrega | Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 34)

  // 2. CONSOLIDAÇÃO DE ESTATÍSTICAS DE NFs
  let totalNFsCount = 0
  let totalValorFaturadoGeral = 0
  let totalEmpenhosComNF = 0

  matchingNotas.forEach(nota => {
    const nfSet = new Set<string>()
    if (nota.itens) {
      nota.itens.forEach((i: any) => {
        const unit = Number(i.valor_unitario) || 0
        const entregas = i.historico_entregas || []
        entregas.forEach((h: any) => {
          const qty = Number(h.quantidade_entregue) || 0
          totalValorFaturadoGeral += qty * unit
          const numRaw = String(h.numero_nf || '').trim() || 'SEM_NF'
          nfSet.add(numRaw)
        })
      })
    }
    if (nfSet.size > 0) {
      totalEmpenhosComNF++
      totalNFsCount += nfSet.size
    }
  })

  // CARD DE RESUMO DE COMPILAÇÃO
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.5)
  doc.setFillColor(250, 252, 255)
  doc.roundedRect(14, 38, 182, 22, 1, 1, 'FD')

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text("RESUMO DA COMPILAÇÃO", 18, 44)

  doc.setDrawColor(226, 232, 240)
  doc.line(18, 46, 192, 46)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text(`Empenhos Processados: `, 18, 53)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${matchingNotas.length} (com NF: ${totalEmpenhosComNF})`, 54, 53)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Total de NFs/Documentos: `, 95, 53)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(`${totalNFsCount} reg.`, 135, 53)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Total Faturado em NFs: `, 152, 53)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(totalValorFaturadoGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 182, 53, { align: 'right' })

  let currentY = 66

  // 3. RENDERIZAÇÃO POR EMPENHO E POR NF
  matchingNotas.forEach(nota => {
    interface ItemEntregaNF {
      descricao: string
      marca: string
      quantidade: number
      unidade: string
      valorUnitario: number
      valorTotal: number
      motivo?: string
    }

    interface NFGroup {
      numero: string
      data: string
      itens: ItemEntregaNF[]
      valorTotalNF: number
    }

    const nfMap = new Map<string, NFGroup>()
    let valorEntregueEmpenho = 0

    if (nota.itens) {
      nota.itens.forEach((i: any) => {
        const unit = Number(i.valor_unitario) || 0
        const entregas = i.historico_entregas || []
        
        entregas.forEach((h: any) => {
          const qty = Number(h.quantidade_entregue) || 0
          const itemVal = qty * unit
          valorEntregueEmpenho += itemVal

          const numRaw = String(h.numero_nf || '').trim()
          const numKey = numRaw || 'SEM_NF'

          let dateStr = h.data_emissao_nf || h.data_entrega
          let dt = 's/ data'
          if (dateStr) {
            const d = new Date(dateStr)
            if (!isNaN(d.getTime())) {
              dt = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
              if (dateStr.includes('T')) dt = new Date(dateStr).toLocaleDateString('pt-BR')
            }
          }

          const numUpper = numRaw.toUpperCase()
          const isPedidoDoc = numUpper.includes('PEDIDO') || numUpper.includes('DAV') || numUpper.includes('PROVISÓRIA') || numUpper.includes('PROVISORIA')
          const displayNum = numRaw ? (isPedidoDoc ? numRaw : `NF ${numRaw}`) : 'Sem NF'

          const itemEntry: ItemEntregaNF = {
            descricao: i.descricao || 'Item sem descrição',
            marca: i.marca || '',
            quantidade: qty,
            unidade: i.unidade || 'UN',
            valorUnitario: unit,
            valorTotal: itemVal,
            motivo: h.motivo_pendencia || undefined
          }

          if (nfMap.has(numKey)) {
            const existing = nfMap.get(numKey)!
            existing.itens.push(itemEntry)
            existing.valorTotalNF += itemVal
          } else {
            nfMap.set(numKey, {
              numero: displayNum,
              data: dt,
              itens: [itemEntry],
              valorTotalNF: itemVal
            })
          }
        })
      })
    }

    const nfsArray = Array.from(nfMap.values())

    // Verificar quebra de página antes de desenhar o card do empenho
    if (currentY > 240) {
      doc.addPage()
      currentY = 18
    }

    // DESENHAR CARD DE EMPENHO
    doc.setFillColor(241, 245, 249)
    doc.setDrawColor(148, 163, 184)
    doc.roundedRect(14, currentY, 182, 11, 0.5, 0.5, 'FD')

    doc.setTextColor(15, 23, 42)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`EMPENHO (NE): ${nota.numero_ne || 'Sem nº'}`, 18, currentY + 7)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    const emissorStr = limitStr(getResolvedName(nota), 35)
    doc.text(`Cliente: ${emissorStr} | Teto: ${(nota.valor_total_teto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 75, currentY + 7)

    doc.setFont('helvetica', 'bold')
    doc.text(`Total NFs: ${valorEntregueEmpenho.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 192, currentY + 7, { align: 'right' })

    currentY += 15

    if (nfsArray.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7.5)
      doc.setTextColor(148, 163, 184)
      doc.text("• Nenhum comprovante / Nota Fiscal lançada para este empenho.", 20, currentY)
      currentY += 8
    } else {
      // Para cada NF deste empenho
      nfsArray.forEach((nf) => {
        if (currentY > 245) {
          doc.addPage()
          currentY = 18
        }

        const tableBody = nf.itens.map(it => [
          `${it.descricao.toUpperCase()}${it.marca ? `\nMARCA: ${it.marca.toUpperCase()}` : ''}${it.motivo ? `\n(Motivo: ${it.motivo})` : ''}`,
          `${it.quantidade} ${it.unidade}`,
          it.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          it.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        ])

        autoTable(doc, {
          startY: currentY,
          head: [[
            `DOCUMENTO: ${nf.numero} (Emissão/Entrega: ${nf.data})`,
            'Qtd Entregue',
            'Valor Unit.',
            'Total do Item'
          ]],
          body: tableBody,
          theme: 'striped',
          headStyles: {
            fillColor: [51, 65, 85],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 7.5,
            cellPadding: 2.5
          },
          styles: {
            fontSize: 7,
            cellPadding: 2.5,
            valign: 'top',
            overflow: 'linebreak'
          },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 26, halign: 'center' },
            2: { cellWidth: 28, halign: 'right' },
            3: { cellWidth: 28, halign: 'right' }
          },
          foot: [[
            'TOTAL DA NOTA FISCAL',
            `${nf.itens.reduce((sum, i) => sum + i.quantidade, 0)} und`,
            '',
            nf.valorTotalNF.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          ]],
          footStyles: {
            fillColor: [248, 250, 252],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            fontSize: 7,
            cellPadding: 2,
            halign: 'right'
          }
        })

        currentY = (doc as any).lastAutoTable.finalY + 6
      })
    }

    currentY += 4
  })

  const uniqueClients = Array.from(new Set(matchingNotas.map(n => getResolvedName(n)).filter(Boolean)))
  const clientText = uniqueClients.length === 1 ? uniqueClients[0] : 'Diversos'

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(100)
    doc.text(`Página ${i} de ${pageCount} | Compilação de Notas Fiscais | Cliente: ${limitStr(clientText, 40)}`, 14, 285)
  }

  injectCopyrightFooter(doc)
  doc.save(`Compilacao_NFs_${new Date().toISOString().split('T')[0]}.pdf`)
}

/**
 * Compila e imprime os arquivos PDF originais anexados às Notas Fiscais e DAVs dos Empenhos Selecionados.
 * Baixa os PDFs originais de historico_entregas, junta todas as páginas com pdf-lib e abre a janela de impressão do navegador.
 */
export async function imprimirNFsAnexadasPDF(
  clienteNome: string,
  todasNotas: any[],
  selectedNotasIds?: number[],
  ordenacao: OrdenacaoEmpenhos = 'DATA_ASC'
): Promise<{ success: boolean; totalArquivos: number; message?: string }> {
  let matchingNotas = todasNotas
  
  if (clienteNome) {
    matchingNotas = matchingNotas.filter(n => getResolvedName(n) === clienteNome)
  }
  
  if (selectedNotasIds && selectedNotasIds.length > 0) {
    matchingNotas = matchingNotas.filter(n => selectedNotasIds.includes(n.id))
  }

  if (matchingNotas.length === 0) {
    return { success: false, totalArquivos: 0, message: 'Nenhum empenho encontrado para os filtros selecionados.' }
  }

  matchingNotas = sortNotas(matchingNotas, ordenacao)

  // Coletar todos os caminhos de arquivos PDF das NFs/DAVs de historico_entregas
  const arquivoCaminhosSet = new Set<string>()
  
  matchingNotas.forEach(nota => {
    if (nota.arquivo_caminho && typeof nota.arquivo_caminho === 'string' && nota.arquivo_caminho.trim()) {
      arquivoCaminhosSet.add(nota.arquivo_caminho.trim())
    }

    if (nota.itens) {
      nota.itens.forEach((i: any) => {
        const entregas = i.historico_entregas || []
        entregas.forEach((h: any) => {
          if (h.arquivo_nf_caminho && typeof h.arquivo_nf_caminho === 'string' && h.arquivo_nf_caminho.trim()) {
            arquivoCaminhosSet.add(h.arquivo_nf_caminho.trim())
          }
        })
      })
    }
  })

  const arquivosList = Array.from(arquivoCaminhosSet)

  if (arquivosList.length === 0) {
    return { 
      success: false, 
      totalArquivos: 0, 
      message: 'Nenhum arquivo PDF de Nota Fiscal ou comprovante anexado foi encontrado nos empenhos selecionados.' 
    }
  }

  try {
    const mergedPdf = await PDFDocument.create()
    let paginasAdicionadas = 0

    for (const rawPath of arquivosList) {
      try {
        const url = rawPath.startsWith('http') ? rawPath : getCleanPublicUrl(rawPath)
        const response = await fetch(url)
        if (!response.ok) {
          console.warn(`[PDF Merge] Não foi possível carregar o arquivo: ${url}`)
          continue
        }
        
        const contentType = response.headers.get('content-type') || ''
        const arrayBuffer = await response.arrayBuffer()

        if (contentType.includes('image/') || rawPath.match(/\.(png|jpg|jpeg|webp)$/i)) {
          const isPng = rawPath.endsWith('.png') || contentType.includes('image/png')
          const img = isPng ? await mergedPdf.embedPng(arrayBuffer) : await mergedPdf.embedJpg(arrayBuffer)
          const page = mergedPdf.addPage([595.28, 841.89]) // A4
          const { width, height } = img.scaleToFit(550, 800)
          page.drawImage(img, {
            x: (595.28 - width) / 2,
            y: (841.89 - height) / 2,
            width,
            height
          })
          paginasAdicionadas++
        } else {
          const srcPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })
          const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
          copiedPages.forEach((page) => mergedPdf.addPage(page))
          paginasAdicionadas += copiedPages.length
        }
      } catch (errFile) {
        console.error(`[PDF Merge Error] Erro ao processar anexo ${rawPath}:`, errFile)
      }
    }

    if (paginasAdicionadas === 0) {
      return {
        success: false,
        totalArquivos: arquivosList.length,
        message: 'Não foi possível ler o conteúdo dos PDFs anexados.'
      }
    }

    const mergedPdfBytes = await mergedPdf.save()
    const blob = new Blob([new Uint8Array(mergedPdfBytes)], { type: 'application/pdf' })
    const blobUrl = URL.createObjectURL(blob)

    const win = window.open(blobUrl, '_blank')
    if (!win) {
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `NFs_Anexadas_Compiladas_${new Date().toISOString().split('T')[0]}.pdf`
      link.click()
    }

    return {
      success: true,
      totalArquivos: arquivosList.length,
      message: `Compilados ${arquivosList.length} arquivo(s) (${paginasAdicionadas} páginas) para impressão.`
    }
  } catch (errMerged) {
    console.error('[PDF Merge Error]', errMerged)
    return {
      success: false,
      totalArquivos: arquivosList.length,
      message: 'Ocorreu um erro ao compilar os arquivos PDF anexados.'
    }
  }
}
