import { supabase } from "./lib/supabase";
import * as pdfjsLib from "pdfjs-dist";
import { toast } from "sonner";
import { parseBrazilianNumber } from "./lib/utils";

// A mágica do Vite: importamos o worker como URL estática (extensão .mjs na v5+)
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

// Configuramos o PDF.js para usar esse worker e fontes padrão
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const STANDARD_FONTS_URL =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/standard_fonts/";

// --- 1. Extração de Texto no Cliente ---
export async function extractTextFromPDF(file: File): Promise<string> {
  console.log("--- [AI Debug] Iniciando Extração de Texto (Vite Worker) ---");
  try {
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[AI Debug] Buffer carregado: ${arrayBuffer.byteLength} bytes`);

    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      standardFontDataUrl: STANDARD_FONTS_URL,
    });
    const pdf = await loadingTask.promise;
    console.log(`[AI Debug] PDF carregado. Páginas: ${pdf.numPages}`);

    if (pdf.numPages > 12) {
      toast.warning(
        `Arquivo extenso (${pdf.numPages} pgs). A extração pode ser imprecisa. Recomenda-se enviar apenas as páginas dos itens.`,
      );
    }

    const pages: { index: number; text: string; textLower: string }[] = [];

    // 1. Extração de texto bruta de todas as páginas
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`[AI Debug] Lendo página ${i}...`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const textItems = (textContent?.items || []) as any[];

      // Agrupar itens por coordenada Y arredondada
      const linesMap: Record<number, any[]> = {};
      textItems.forEach((item) => {
        if (!item || typeof item.str !== "string") return;
        const y = item.transform ? Math.round(item.transform[5]) : 0;
        if (!linesMap[y]) {
          linesMap[y] = [];
        }
        linesMap[y].push(item);
      });

      // Ordenar as chaves Y de forma decrescente
      const sortedYs = Object.keys(linesMap)
        .map(Number)
        .sort((a, b) => b - a);

      // Unir itens da mesma linha separados por | e ordenados horizontalmente por X
      const pageText = sortedYs
        .map((y) => {
          const lineItems = linesMap[y];
          lineItems.sort((a, b) => {
            const ax = a.transform ? a.transform[4] : 0;
            const bx = b.transform ? b.transform[4] : 0;
            return ax - bx;
          });
          return lineItems
            .map((item) => item.str.trim())
            .filter(Boolean)
            .join(" | ");
        })
        .filter(Boolean)
        .join("\n");

      const textLower = pageText
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .toLowerCase();

      pages.push({ index: i, text: pageText, textLower });
    }

    // 2. Detecção heurística: este PDF é uma Ata de Registro de Preços?
    // Baseado exclusivamente na primeira página para não interferir com NFs e Empenhos.
    const primeiraLower = pages[0]?.textLower ?? "";
    
    const isEmpenhoOrOcDoc =
      primeiraLower.includes("pedido de empenho") ||
      primeiraLower.includes("nota de empenho") ||
      primeiraLower.includes("ordem de fornecimento") ||
      primeiraLower.includes("ordem de compra") ||
      primeiraLower.includes("autorizacao de fornecimento") ||
      primeiraLower.includes("autorização de fornecimento") ||
      primeiraLower.includes("pedido de compra");

    const isAtaDoc =
      !isEmpenhoOrOcDoc && (
        primeiraLower.includes("ata de registro") ||
        primeiraLower.includes("registro de preco") ||
        primeiraLower.includes("registro de preço") ||
        (primeiraLower.includes("arp") && primeiraLower.includes("pregao"))
      );

    console.log(`[AI Debug Filter] Documento detectado como ATA: ${isAtaDoc ? "SIM" : "NÃO"}`);

    // 2b. Análise inteligente global do documento para saber se existe resumo de itens
    // (Mantida para documentos não-ata)
    const hasSummaryPage = pages.some(p => 
      p.index > 1 && (
        p.textLower.includes("quantitativo geral") || 
        p.textLower.includes("resumo do quantitativo") ||
        p.textLower.includes("valores consolidados") ||
        p.textLower.includes("itens adjudicados") ||
        p.textLower.includes("itens registrados") ||
        (p.textLower.includes("lote/item") && p.textLower.includes("quantidade total"))
      )
    );

    console.log(`[AI Debug Filter] Presença de página de resumo/geral: ${hasSummaryPage ? "SIM" : "NÃO"}`);

    // 3. Filtragem das páginas por relevância
    let keptCount = 0;
    let fullText = "";

    pages.forEach((p) => {
      const i = p.index;

      // Regra A: Página 1 sempre é mantida (contém metadados críticos de cabeçalho)
      if (i === 1) {
        fullText += `\n--- Pág ${i} ---\n${p.text}`;
        keptCount++;
        return;
      }

      // ================================================================
      // CAMINHO ATA: filtro por linha (cirúrgico) em vez de por página
      // Só entra aqui se isAtaDoc = true.
      // Preserva qualquer linha que pareça dado de tabela, mesmo que a
      // página também contenha texto jurídico.
      // ================================================================
      if (isAtaDoc) {
        // Detalhamento por requisitante: descarta a página inteira (duplicação real)
        const isDetailedBreakdown =
          p.textLower.includes("itens detalhados por requisitante") ||
          p.textLower.includes("detalhamento por requisitante") ||
          p.textLower.includes("detalhado por requisitante") ||
          p.textLower.includes("itens detalhados por orgao") ||
          p.textLower.includes("detalhado por orgao");

        if (isDetailedBreakdown && hasSummaryPage) {
          console.log(`[AI Debug Filter] Página ${i} descartada (ATA): Detalhamento redundante por requisitante.`);
          return;
        }

        // Para ATAs, mantemos o texto completo da página para não perder nomes de produtos ou cabeçalhos de fornecedores
        fullText += `\n--- Pág ${i} ---\n${p.text}`;
        keptCount++;
        return;
      }

      // ================================================================
      // CAMINHO PADRÃO (NF, Empenho, etc): lógica original intacta
      // ================================================================

      // Regra B: Se existe uma página de resumo/geral, podemos ignorar as páginas redundantes
      // de detalhamento por requisitante/município (evita duplicação e contagem duplicada)
      if (hasSummaryPage) {
        const isDetailedBreakdown = 
          p.textLower.includes("itens detalhados por requisitante") ||
          p.textLower.includes("detalhados por requisitante") ||
          p.textLower.includes("detalhamento por requisitante") ||
          p.textLower.includes("detalhado por requisitante") ||
          p.textLower.includes("detalhamento de itens por requisitante") ||
          p.textLower.includes("itens detalhados por orgao") ||
          p.textLower.includes("detalhado por orgao");
          
        if (isDetailedBreakdown) {
          console.log(`[AI Debug Filter] Página ${i} descartada: Detalhamento por requisitante redundante.`);
          return;
        }
      }

      // Regra C: Filtrar páginas de dotação orçamentária ou fontes de financiamento sem itens reais
      const hasDotacao = 
        p.textLower.includes("dotacao orcamentaria") || 
        p.textLower.includes("dotaçao orçamentaria") || 
        p.textLower.includes("fontes de financiamento") ||
        p.textLower.includes("valores por fonte de financiamento");
        
      const hasItensTable = 
        p.textLower.includes("quantitativo geral") || 
        p.textLower.includes("itens registrados") || 
        p.textLower.includes("itens da ata") || 
        p.textLower.includes("itens do empenho") || 
        p.textLower.includes("lote/item") || 
        p.textLower.includes("valor unit") ||
        p.textLower.includes("valor total");

      if (hasDotacao && !hasItensTable) {
        console.log(`[AI Debug Filter] Página ${i} descartada: Apenas dotação orçamentária / fontes.`);
        return;
      }

      // Regra D: Filtrar páginas de faturamento / cláusulas contratuais / assinaturas padrão sem itens
      const hasBoilerplate = 
        p.textLower.includes("do faturamento") || 
        p.textLower.includes("do pagamento") || 
        p.textLower.includes("das obrigacoes") || 
        p.textLower.includes("das penalidades") || 
        p.textLower.includes("da rescisao") || 
        p.textLower.includes("foro da comarca") || 
        p.textLower.includes("disposicoes gerais") ||
        p.textLower.includes("representante legal") ||
        p.textLower.includes("assinatura do") ||
        p.textLower.includes("escreva seu nome");

      if (hasBoilerplate && !hasItensTable) {
        console.log(`[AI Debug Filter] Página ${i} descartada: Cláusulas jurídicas ou assinaturas sem itens.`);
        return;
      }

      // Mantém a página
      fullText += `\n--- Pág ${i} ---\n${p.text}`;
      keptCount++;
    });

    console.log(`[AI Debug Filter] Filtro concluído. Páginas mantidas: ${keptCount}/${pdf.numPages}`);

    console.log("[AI Debug] Extração concluída");
    // Removemos qualquer aspa dupla do texto extraído para evitar quebras de JSON no Gemini
    return fullText.replace(/"/g, "'");
  } catch (err) {
    console.error("[AI Debug] Falha na extração:", err);
    throw err;
  }
}

// --- 2. Comunicação com a Edge Function (Supabase) ---
export async function analyzeWithAI(
  file: File | null,
  textContent: string,
  promptOverride?: string,
  responseSchema?: any,
  model?: string,
  imagesBase64?: string[],
  forceFile?: boolean,
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) throw new Error("Usuário não autenticado. Faça login novamente.");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${baseUrl}/functions/v1/process-pdf`;

  console.log("[AI Debug] Enviando dados para a IA (Estratégia Híbrida)");

  let fileBase64 = "";

  if (imagesBase64 && imagesBase64.length > 0) {
    console.log(`[AI Debug] Usando ${imagesBase64.length} imagens paginadas renderizadas (payload ultra-leve).`);
    textContent = "";
  } else {
    // Remove o contexto injetado e os delimitadores de página para saber o tamanho real do texto extraído das páginas
    const textWithoutContext = textContent.replace(/CONTEXTO DA ATA[^]*?--- INÍCIO DO BLOCO DE ITENS[^\n]*\n/, "");
    const cleanTextLength = textWithoutContext.replace(/--- Pág \d+ ---/g, "").trim().length;

    // Se o texto real for muito curto (PDF escaneado) OU forceFile for verdadeiro, enviamos o arquivo original (Base64)
    if ((cleanTextLength < 100 || forceFile) && file) {
      fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.substring(result.indexOf(",") + 1);
          resolve(base64);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
      if (!forceFile) {
        textContent = "";
      }
      console.log(
        `[AI Debug] Forçando arquivo ou texto insuficiente (${cleanTextLength} chars). Enviando arquivo original (Base64).`,
      );
    }
  }

  let currentModel = model;
  if (!currentModel || currentModel === 'flash' || currentModel === 'default') {
    currentModel = 'gemini-1.5-flash';
  } else if (currentModel === 'pro') {
    currentModel = 'gemini-1.5-pro';
  }

  const maxRetries = 4;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[AI Debug] Chamando Edge Function (Tentativa ${attempt}/${maxRetries}): ${functionUrl} [Modelo: ${currentModel || 'default'}]`);
      const startTime = Date.now();

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          textContent,
          fileBase64,
          imagesBase64,
          mimeType: file ? file.type : 'application/pdf',
          prompt: promptOverride,
          responseSchema,
          model: currentModel,
        }),
      });

      console.log(
        `[AI Debug] Resposta recebida em ${Date.now() - startTime}ms. Status: ${response.status}`,
      );
      const responseText = await response.text();

      if (!response.ok) {
        console.error(`[AI Debug] Erro HTTP ${response.status}:`, responseText);
        let cleanMessage = '';
        try {
          const errJson = JSON.parse(responseText);
          if (errJson && errJson.error) {
            cleanMessage = errJson.error;
          }
        } catch (e) {
          // Ignore JSON parse error
        }

        const isQuotaErr = response.status === 429 || (response.status === 400 && (
          responseText.includes("Cota temporária") ||
          responseText.includes("RESOURCE_EXHAUSTED") ||
          responseText.includes("rate limit") ||
          responseText.includes("quota") ||
          responseText.includes("Quota")
        ));

        if (isQuotaErr && attempt < maxRetries) {
          if (currentModel === "pro" || currentModel === "gemini-1.5-pro") {
            currentModel = "gemini-1.5-flash";
            console.log("[AI Debug] Cota excedida no modelo PRO. Alternando para modelo FLASH otimizado...");
          }
          const backoffDelay = attempt * 3000;
          toast.info(`Cota temporária da IA atingida. Retentando em ${backoffDelay / 1000}s com modelo otimizado...`);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        }

        if (cleanMessage) {
          throw new Error(cleanMessage);
        }
        throw new Error(`Erro HTTP ${response.status}: ${responseText}`);
      }

      const parsed = parseRobustJSON(responseText);
      console.log("[AI Debug] JSON processado com sucesso.");
      return parsed;
    } catch (err: any) {
      lastError = err;
      const isQuotaMessage = String(err.message || "").includes("Cota temporária") ||
        String(err.message || "").includes("RESOURCE_EXHAUSTED") ||
        String(err.message || "").includes("rate limit") ||
        String(err.message || "").includes("quota");

      if (isQuotaMessage && attempt < maxRetries) {
        if (currentModel === "pro") {
          currentModel = "flash";
        }
        const backoffDelay = attempt * 3500;
        toast.info(`Cota temporária da IA atingida. Aguardando ${backoffDelay / 1000}s para retentar...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

/**
 * Utilitário para extrair JSON de strings que podem conter markdown (```json ... ```)
 * ou textos explicativos adicionados pela IA.
 */
function parseRobustJSON(text: string) {
  try {
    // Tenta parse direto primeiro
    return JSON.parse(text);
  } catch {
    // Limpeza Robusta: Pegamos apenas o que está dentro de { ... }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0].trim());
      } catch (err) {
        console.error("[AI Debug] Falha ao parsear JSON extraído:", err);
        throw new Error("A IA retornou um JSON malformado.");
      }
    }

    // Se o texto conter frases como "preciso que forneça", "não forneceu", etc, o arquivo provavelmente é grande demais
    if (
      text.toLowerCase().includes("forneça") ||
      text.toLowerCase().includes("conteúdo")
    ) {
      throw new Error(
        "O arquivo é muito grande ou complexo. Tente selecionar apenas as páginas principais do empenho.",
      );
    }

    throw new Error(
      "Não foi possível localizar um JSON válido na resposta da IA.",
    );
  }
}

async function getExtractedText(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    console.log(`[AI Debug] Arquivo não é PDF. Tratando como Imagem/Multimodal: ${file.name}`);
    return "";
  }
  return await extractTextFromPDF(file);
}

// --- 3. Prompts Específicos e Regras de Negócio ---
export async function extrairDadosAta(file: File) {
  try {
    const extractedText = await getExtractedText(file);

    // =====================================================================
    // FASE 0: VARREDURA LOCAL PRÉ-IA (CHECKSUM)
    // Conta linhas com separador "|" + valor monetário — proxy de itens de tabela.
    // Usado exclusivamente para validação pós-extração, não altera nenhum dado.
    // =====================================================================
    const linhasDoTexto = extractedText.split("\n");
    const linhasDeItem = linhasDoTexto.filter(
      (linha) => linha.includes("|") && /R\$|,\d{2}/.test(linha),
    );
    const checksumContagem = linhasDeItem.length;

    const matchValorTotal = extractedText.match(
      /valor\s+total\s*(?:da\s+ata|geral|dos\s+itens)?\s*:?\s*R\$\s*([\d.,]+)/i,
    );
    const checksumValorTotal = matchValorTotal
      ? parseBrazilianNumber(matchValorTotal[1])
      : null;

    console.log(`[Checksum] Linhas de item estimadas no texto: ${checksumContagem}`);
    if (checksumValorTotal !== null) {
      console.log(`[Checksum] Valor total explícito encontrado: R$ ${checksumValorTotal.toFixed(2)}`);
    }

    let todosOsItens: any[] = [];
    let cabecalhoResult: any = null;

    const textWithoutContext = extractedText.replace(/CONTEXTO DA ATA[^]*?--- INÍCIO DO BLOCO DE ITENS[^\n]*\n/, "");
    const cleanTextLength = textWithoutContext.replace(/--- Pág \d+ ---/g, "").trim().length;

    if (cleanTextLength < 100) {
      console.log("[AI Debug] Ata identificada como escaneada/imagem. Realizando extração completa via Visão (Base64)...");

      const promptAtaScanned = `
      Você é um especialista em Atas de Registro de Preços (ARP) brasileiras de altíssima precisão.
      Sua tarefa é extrair os dados do cabeçalho E todos os itens da tabela de produtos registrados para a empresa ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA (CNPJ: 00.000.000/0001-99) ou NEXUS.

      REGRA GEOGRÁFICA CRÍTICA:
      - 'orgao_gerenciador.municipio' e 'orgao_gerenciador.estado' devem ser do órgão COMPRADOR (prefeitura, hospital, consórcio), NUNCA do fornecedor (ex: ROSAFARM está em Palmas/TO — ignore esse endereço).

      REGRAS DOS ITENS:
      - 'posicao': coluna 'Item', 'Lote' ou 'Cód.' — retorne como STRING.
      - 'descricao': coluna 'Produto', 'Especificação' ou 'Objeto'.
      - 'unidade': termo exato (FR, AMP, CX, COMP, UNID, UN, BISNAGA, BOLSA, AMPOLA, COMPRIMIDO, CAPSULA, FRASCO).
      - 'quantidade_total': Quantidade Total/Global — STRING exatamente como no documento (ex: '1.500').
      - 'valor_unitario': V. Unit / Preço Estimado / Vl. Unit — STRING exata.
      - 'marca': marca ou fabricante (ou null).
      - 'categoria': MEDICAMENTO | MATERIAL HOSP | ODONTO | MOBILIÁRIO | ELETRÔNICOS.
      - 'fornecedor': nome da empresa vencedora do item.

      SCHEMA JSON OBRIGATÓRIO:
      {
        "sucesso": true,
        "numero_ata": string,
        "orgao_gerenciador": {
          "nome": string,
          "municipio": string,
          "estado": string
        },
        "valor_total_ata": string | null,
        "itens_registrados": [
          {
            "posicao": string,
            "descricao": string,
            "unidade": string,
            "marca": string | null,
            "quantidade_total": string,
            "valor_unitario": string,
            "categoria": string,
            "fornecedor": string
          }
        ]
      }
      `;

      const ataScannedSchema = {
        type: "OBJECT",
        properties: {
          sucesso: { type: "BOOLEAN" },
          numero_ata: { type: "STRING" },
          orgao_gerenciador: {
            type: "OBJECT",
            properties: {
              nome: { type: "STRING" },
              municipio: { type: "STRING" },
              estado: { type: "STRING" },
            },
            required: ["nome"],
          },
          valor_total_ata: { type: "STRING", nullable: true },
          itens_registrados: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                posicao: { type: "STRING" },
                descricao: { type: "STRING" },
                unidade: { type: "STRING" },
                marca: { type: "STRING", nullable: true },
                quantidade_total: { type: "STRING" },
                valor_unitario: { type: "STRING" },
                categoria: { type: "STRING" },
                fornecedor: { type: "STRING" },
              },
              required: [
                "posicao",
                "descricao",
                "unidade",
                "quantidade_total",
                "valor_unitario",
                "categoria",
                "fornecedor",
              ],
            },
          },
        },
        required: ["sucesso", "numero_ata", "orgao_gerenciador", "itens_registrados"],
      };

      const resultScanned = await analyzeWithAI(
        file,
        extractedText,
        promptAtaScanned,
        ataScannedSchema,
        "flash",
      );

      if (!resultScanned || !resultScanned.sucesso) {
        throw new Error("Falha ao extrair dados da Ata escaneada.");
      }

      todosOsItens = Array.isArray(resultScanned.itens_registrados) ? resultScanned.itens_registrados : [];
      cabecalhoResult = {
        numero_ata: resultScanned.numero_ata,
        orgao_gerenciador: resultScanned.orgao_gerenciador,
        valor_total_ata: resultScanned.valor_total_ata,
      };
    } else {
      // =====================================================================
      // FASE 1: EXTRAÇÃO DO CABEÇALHO (chamada leve, só a página 1)
      // Captura numero_ata, orgao_gerenciador e valor_total_ata sem processar itens.
      // =====================================================================
      console.log("[AI Debug] FASE 1: Extraindo cabeçalho da ATA...");

      const paginaUm = extractedText
        .split(/--- Pág 2 ---/)[0]
        .replace(/--- Pág 1 ---/, "")
        .trim();

      const promptCabecalho = `
Você é um especialista em documentos públicos brasileiros.
Leia o cabeçalho abaixo de uma Ata de Registro de Preços e extraia APENAS os campos solicitados.
NÃO extraia itens de produtos — apenas metadados do documento.

REGRA GEOGRÁFICA CRÍTICA:
- 'orgao_gerenciador.municipio' e 'orgao_gerenciador.estado' devem ser do órgão COMPRADOR (prefeitura, hospital, consórcio), NUNCA do fornecedor (ex: ROSAFARM está em Palmas/TO — ignore esse endereço).

Retorne APENAS o JSON minificado abaixo, sem explicações:
{"sucesso":true,"numero_ata":"string","orgao_gerenciador":{"nome":"string","municipio":"string","estado":"string"},"valor_total_ata":"string ou null"}
`;

      const cabecalhoSchema = {
        type: "OBJECT",
        properties: {
          sucesso: { type: "BOOLEAN" },
          numero_ata: { type: "STRING" },
          orgao_gerenciador: {
            type: "OBJECT",
            properties: {
              nome: { type: "STRING" },
              municipio: { type: "STRING" },
              estado: { type: "STRING" },
            },
            required: ["nome"],
          },
          valor_total_ata: { type: "STRING", nullable: true },
        },
        required: ["sucesso", "numero_ata", "orgao_gerenciador"],
      };

      cabecalhoResult = await analyzeWithAI(
        file,
        paginaUm,
        promptCabecalho,
        cabecalhoSchema,
        "flash",
      );

      console.log(
        "[AI Debug] FASE 1 concluída:",
        cabecalhoResult?.numero_ata,
        "|",
        cabecalhoResult?.orgao_gerenciador?.municipio,
      );

      // =====================================================================
      // FASE 2: EXTRAÇÃO DE ITENS POR CHUNKS DE PÁGINA
      // Divide o texto em blocos de 3 páginas e processa sequencialmente.
      // Passa como contexto fixo o fornecedor alvo e o último item processado.
      // Espelha o padrão já usado com sucesso nas NFs.
      // =====================================================================
      console.log("[AI Debug] FASE 2: Extraindo itens da ATA em chunks...");

      const blocosPagina = extractedText
        .split(/(?=--- Pág \d+ ---)/)
        .filter((b) => b.trim().length > 0);

      const CHUNK_SIZE = 3;
      const totalPaginas = blocosPagina.length;

      const getPageNumber = (bloco: string): number => {
        const match = bloco.match(/--- Pág (\d+) ---/);
        return match ? parseInt(match[1], 10) : 0;
      };

      const isPageScanned = (bloco: string): boolean => {
        const clean = bloco.replace(/--- Pág \d+ ---/g, "").trim();
        return clean.length < 150;
      };

      const ataItensSchema = {
        type: "OBJECT",
        properties: {
          sucesso: { type: "BOOLEAN" },
          itens_registrados: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                posicao: { type: "STRING" },
                descricao: { type: "STRING" },
                unidade: { type: "STRING" },
                marca: { type: "STRING", nullable: true },
                quantidade_total: { type: "STRING" },
                valor_unitario: { type: "STRING" },
                categoria: { type: "STRING" },
                codigo_mapeamento_ia: { type: "STRING" },
                fornecedor: { type: "STRING" },
              },
              required: [
                "posicao",
                "descricao",
                "unidade",
                "quantidade_total",
                "valor_unitario",
                "categoria",
                "fornecedor",
              ],
            },
          },
        },
        required: ["sucesso", "itens_registrados"],
      };

      let ultimaPosicaoLida = "0";

      for (let i = 0; i < totalPaginas; i += CHUNK_SIZE) {
        const chunkBlocks = blocosPagina.slice(i, i + CHUNK_SIZE);
        const paginasDoChunk = chunkBlocks.map(getPageNumber).filter(Boolean);
        const temPaginaEscaneada = chunkBlocks.some(isPageScanned);

        let chunkTexto = chunkBlocks.join("\n");
        let forceFile = false;

        if (temPaginaEscaneada) {
          // Para forçar a Edge Function a enviar o PDF (Base64), encurtamos o textContent para < 100 caracteres.
          chunkTexto = `Páginas: ${paginasDoChunk.join(', ')}`;
          forceFile = true;
        }

        const idx = Math.floor(i / CHUNK_SIZE);
        const totalChunks = Math.ceil(totalPaginas / CHUNK_SIZE);

        if (idx > 0) {
          // Pequena pausa entre chunks para respeitar a cota de Tokens por Minuto da Google API
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        console.log(
          `[AI Debug] Processando chunk ${idx + 1}/${totalChunks} (Págs ${paginasDoChunk.join(', ')}). Último item: ${ultimaPosicaoLida}. Forçar arquivo: ${forceFile}`
        );

        const promptItens = `
Você é um extrator de dados de Atas de Registro de Preços (ARP) brasileiras de altíssima precisão.
Sua tarefa é extrair APENAS os itens da tabela de produtos/medicamentos contidos nas páginas: ${paginasDoChunk.join(', ')} do documento PDF fornecido. Ignore as outras páginas do documento.

=== CONTEXTO FIXO (não altere) ===
- Identificação de Fornecedores: O documento pode conter itens de múltiplos fornecedores. No campo 'fornecedor', preencha a Razão Social/CNPJ exata do cabeçalho da seção/tabela onde o item está registrado.
- Último número de item processado no chunk anterior: ${ultimaPosicaoLida}
  → Se você encontrar itens com numeração MENOR ou IGUAL a ${ultimaPosicaoLida}, IGNORE-OS (já foram extraídos).
  → Se ${ultimaPosicaoLida} === "0", extraia todos os itens encontrados normalmente.

=== REGRAS DE EXTRAÇÃO ===
PASSO 1 — ANCORAGEM DE FORNECEDOR:
- Cada item deve ter o campo 'fornecedor' preenchido com a Razão Social / CNPJ do fornecedor do cabeçalho/título da seção mais próximo acima dele (ex: LUMINATA, MACRO PRODUTOS, ROSAFARM, ATEXARA, etc). NUNCA coloque ROSAFARM para itens cujos cabeçalhos pertençam a outras empresas.
- Se a página for continuação sem novo cabeçalho, repita o último fornecedor identificado.
- REGRA GEOGRÁFICA: JAMAIS use endereço/município do fornecedor como orgao_gerenciador.

PASSO 2 — RECONSTRUÇÃO DE LINHAS:
- Se um item começar em uma página e terminar na próxima, reconstrua a linha completa.
- IGNORE: cabeçalhos repetidos, brasões, números de página, avisos de sistema, totais de rodapé de página (ex: 'Total: R$ ...').

PASSO 3 — MAPEAMENTO DE COLUNAS:
- 'posicao': coluna 'Item', 'Lote' ou 'Cód.' — retorne como STRING.
- 'descricao': coluna 'Produto', 'Especificação' ou 'Objeto'.
- 'unidade': termo exato (FR, AMP, CX, COMP, UNID, UN, BISNAGA, BOLSA, AMPOLA, COMPRIMIDO, CAPSULA, FRASCO).
- 'quantidade_total': Quantidade Total/Global — STRING exatamente como no documento (ex: '1.500').
- 'valor_unitario': V. Unit / Preço Estimado / Vl. Unit — STRING exata. NUNCA confunda com Valor Total.
- 'marca': marca ou fabricante. null se não houver.
- 'categoria': MEDICAMENTO | MATERIAL HOSP | ODONTO | MOBILIÁRIO | ELETRÔNICOS.
- 'fornecedor': nome da empresa vencedora do item.

PASSO 4 — MATEMÁTICA:
- Verifique internamente: quantidade × valor_unitario = valor_total antes de gerar o JSON.

REGRAS FINAIS:
- NUNCA use aspas duplas (") dentro de strings de texto.
- Retorne JSON minificado. Sem explicações, markdown ou blocos de código.
- Se não houver itens nas páginas ${paginasDoChunk.join(', ')}, retorne: {"sucesso":true,"itens_registrados":[]}
`;

        try {
          const resultChunk = await analyzeWithAI(
            file,
            chunkTexto,
            promptItens,
            ataItensSchema,
            "flash",
            undefined,
            forceFile,
          );

          if (
            resultChunk &&
            Array.isArray(resultChunk.itens_registrados) &&
            resultChunk.itens_registrados.length > 0
          ) {
            console.log(
              `[AI Debug] Chunk ${idx + 1}: ${resultChunk.itens_registrados.length} itens extraídos.`,
            );
            todosOsItens = [...todosOsItens, ...resultChunk.itens_registrados];

            const ultimoItem =
              resultChunk.itens_registrados[
                resultChunk.itens_registrados.length - 1
              ];
            if (ultimoItem?.posicao) {
              ultimaPosicaoLida = String(ultimoItem.posicao);
            }
          } else {
            console.log(`[AI Debug] Chunk ${idx + 1}: sem itens.`);
          }
        } catch (err) {
          console.error(`[AI Debug] Erro no chunk ${idx + 1}:`, err);
        }
      }
    }

    console.log(
      `[AI Debug] FASE 2 concluída. Total bruto de itens: ${todosOsItens.length}`,
    );

    // =====================================================================
    // PÓS-PROCESSAMENTO
    // =====================================================================
    const mappedItens = todosOsItens.map((it: any) => {
      const qty = parseBrazilianNumber(it.quantidade_total);
      const unit = parseBrazilianNumber(it.valor_unitario);
      const total = qty * unit;

      const fornOriginal = String(it.fornecedor || "");
      const matchCnpj = fornOriginal.replace(/\D/g, "");
      let cnpjOriginal = "";
      if (matchCnpj.length >= 8) {
        cnpjOriginal = matchCnpj.substring(0, 8);
      } else {
        const fornUpper = fornOriginal.toUpperCase();
        if (fornUpper.includes("ROSAFARM")) {
          cnpjOriginal = "37676047";
        } else if (fornUpper.includes("NEXUS")) {
          cnpjOriginal = "13973552";
        } else {
          cnpjOriginal = fornUpper.replace(/[^A-Z0-9]/g, "").substring(0, 8);
        }
      }

      return {
        ...it,
        posicao: it.posicao
          ? parseInt(String(it.posicao).replace(/\D/g, ""), 10) || 0
          : 0,
        valor_total: Number(total.toFixed(2)),
        quantidade_total: qty,
        valor_unitario: unit,
        fornecedor: fornOriginal,
        cnpjOriginal,
      };
    });

    // =====================================================================
    // MÁQUINA DE ESTADOS DE TITULARIDADE (FILTRAGEM DE FORNECEDORES)
    // =====================================================================
    const checkIsNossaEmpresa = (fornStr: string): boolean => {
      const clean = fornStr.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return (
        clean.includes("ROSAFARM") ||
        clean.includes("NEXUS") ||
        clean.includes("37676047") ||
        clean.includes("13973552")
      );
    };

    const checkIsDefinitivamenteConcorrente = (fornStr: string): boolean => {
      if (!fornStr || fornStr.trim() === "") return false;
      const clean = fornStr.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const temNossoCNPJ =
        clean.includes("37676047") ||
        clean.includes("13973552") ||
        clean.includes("ROSAFARM") ||
        clean.includes("NEXUS");
      if (temNossoCNPJ) return false;

      const termosGenericos = [
        "PREFEITURA",
        "CONSORCIO",
        "ESTADO",
        "MUNICIPIO",
        "SECRETARIA",
        "ORGAO",
        "ADJUDICADO",
        "VALOR",
        "ITEM",
        "LOTE",
        "DEMONSTRATIVO",
        "PREGAO",
        "LICITACAO",
        "LICITA",
        "PROCESSO",
        "ATA",
        "REGISTRO",
        "CONTRATANTE",
        "CONTRATADA",
        "EMPRESA",
      ];
      const eTermoGenerico = termosGenericos.some((term) =>
        clean.includes(term),
      );
      if (eTermoGenerico) return false;

      return true;
    };

    let isNossaEmpresa = false;
    const itensFinais = mappedItens.filter((item: any) => {
      const fornOriginal = String(item.fornecedor || "").trim();

      if (fornOriginal !== "") {
        if (checkIsNossaEmpresa(fornOriginal)) {
          // Caso 1: identificamos positivamente nossa empresa
          isNossaEmpresa = true;
        } else if (checkIsDefinitivamenteConcorrente(fornOriginal)) {
          // Caso 2: identificamos positivamente um concorrente com CNPJ diferente
          isNossaEmpresa = false;
        }
        // Caso 3: ambíguo / apenas nome sem CNPJ → herda estado anterior (não faz nada)
      }

      // Se a chave estiver ativa, normalizamos o nome e incluímos o item
      if (isNossaEmpresa) {
        const upper = fornOriginal.toUpperCase();
        if (upper.includes("NEXUS") || upper.includes("13973552")) {
          item.fornecedor = "NEXUS (Consolidado)";
        } else {
          item.fornecedor = "ROSAFARM (Consolidado)";
        }
      }

      return isNossaEmpresa;
    });

    // =====================================================================
    // NOVA CHAVE DE DEDUPLICAÇÃO: posição no TR + raiz do CNPJ do fornecedor.
    // Muito mais estável que hash de texto — posição é única por documento.
    // Fallback para chave textual em itens sem numeração legível.
    // =====================================================================
    const gerarChaveRobusta = (item: any) => {
      const posicao = parseInt(
        String(item.posicao || "0").replace(/\D/g, ""),
        10,
      );

      if (posicao > 0) {
        const cnpjForn = item.cnpjOriginal || "DESCONHECIDO";
        return `POS-${posicao}-FORN-${cnpjForn}`;
      }

      // Fallback textual (para itens sem número de posição)
      const descLetras = String(item.descricao || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z]/g, "")
        .toLowerCase()
        .substring(0, 15);
      const matchNum = String(item.descricao || "").match(/\d+/);
      const descNumeros = matchNum ? matchNum[0] : "";
      const qtd = String(item.quantidade || item.quantidade_total || "").replace(
        /\D/g,
        "",
      );
      const unit = String(item.valor_unitario || "").replace(/[^0-9]/g, "");
      return `LET-${descLetras}-NUM-${descNumeros}-QTD-${qtd}-UNIT-${unit}`;
    };

    // Deduplicação com nova Chave Robusta
    const itensFiltrados: any[] = [];
    const chavesVistas = new Set<string>();
    itensFinais.forEach((item: any) => {
      const chave = gerarChaveRobusta(item);
      if (!chavesVistas.has(chave)) {
        chavesVistas.add(chave);
        itensFiltrados.push(item);
      } else {
        console.log(`[Dedup] Item ignorado por duplicação — chave: ${chave}`);
      }
    });

    // =====================================================================
    // AUDITORIA MATEMÁTICA PÓS-EXTRAÇÃO (intacta) + VALIDAÇÃO DE CHECKSUM
    // =====================================================================
    const auditarExtracao = (itensExtraidos: any[]) => {
      let somaTotal = 0;
      let errosDeMatematica = 0;
      console.log("[Auditoria] === INICIANDO AUDITORIA MATEMÁTICA DOS ITENS ===");
      itensExtraidos.forEach((item, index) => {
        const qtd = Number(item.quantidade_total ?? item.quantidade) || 0;
        const vUnitario = Number(item.valor_unitario) || 0;
        const vTotalLido = Number(item.valor_total) || 0;
        somaTotal += vTotalLido;
        const vTotalCalculado = Number((qtd * vUnitario).toFixed(2));
        if (Math.abs(vTotalCalculado - vTotalLido) > 0.02) {
          console.warn(
            `🚨 [Auditoria] Alucinação no Item ${index + 1} (${item.codigo_item || "S/N"} - ${String(item.descricao || "").slice(0, 60)})`,
          );
          console.warn(
            `   Esperado : Qtd(${qtd}) × Unit(R$${vUnitario}) = R$${vTotalCalculado}`,
          );
          console.warn(
            `   Lido pela IA                              = R$${vTotalLido}`,
          );
          errosDeMatematica++;
        }
      });
      console.log(`[Auditoria] === RESULTADO ===`);
      console.log(`[Auditoria] Soma Total Calculada: R$ ${somaTotal.toFixed(2)}`);
      console.log(
        `[Auditoria] Itens com inconsistência matemática: ${errosDeMatematica} / ${itensExtraidos.length}`,
      );

      // Validação de checksum de contagem
      const diferencaContagem = Math.abs(
        itensFiltrados.length - checksumContagem,
      );
      const toleranciaContagem = Math.max(3, Math.ceil(checksumContagem * 0.1));
      if (checksumContagem > 0 && diferencaContagem > toleranciaContagem) {
        console.warn(
          `⚠️ [Checksum] DIVERGÊNCIA na contagem! Estimado: ${checksumContagem} | Extraído: ${itensFiltrados.length} | Diferença: ${diferencaContagem}`,
        );
      } else if (checksumContagem > 0) {
        console.log(
          `✅ [Checksum] Contagem dentro da tolerância. Estimado: ${checksumContagem} | Extraído: ${itensFiltrados.length}`,
        );
      }

      // Validação de checksum de valor
      if (checksumValorTotal !== null) {
        const diferencaValor = Math.abs(somaTotal - checksumValorTotal);
        if (diferencaValor > 1.0) {
          console.warn(
            `⚠️ [Checksum] DIVERGÊNCIA no valor total! Texto: R$ ${checksumValorTotal.toFixed(2)} | IA: R$ ${somaTotal.toFixed(2)} | Diferença: R$ ${diferencaValor.toFixed(2)}`,
          );
        } else {
          console.log(`✅ [Checksum] Valor total dentro da tolerância.`);
        }
      }

      console.log("[Auditoria] ==========================================");
    };
    auditarExtracao(itensFiltrados);

    // Monta o resultado final consolidando cabeçalho (Fase 1) + itens (Fase 2)
    const result = {
      sucesso: true,
      numero_ata: cabecalhoResult?.numero_ata ?? null,
      orgao_gerenciador: cabecalhoResult?.orgao_gerenciador ?? null,
      valor_total_ata: cabecalhoResult?.valor_total_ata
        ? parseBrazilianNumber(cabecalhoResult.valor_total_ata)
        : null,
      itens_registrados: itensFiltrados,
      _checksum: {
        linhas_estimadas: checksumContagem,
        itens_extraidos: itensFiltrados.length,
        valor_total_texto: checksumValorTotal,
      },
    };

    console.log(
      `[AI Debug] Extração final da ATA concluída. Itens: ${itensFiltrados.length}`,
    );
    return result;
  } catch (error) {
    console.error("Erro na extração da ATA:", error);
    return null;
  }
}

// --- 4. Extração de Nota Fiscal (NF) ---
export async function extrairDadosNF(file: File, referenciaItens?: any[]) {
  try {
    const extractedText = await getExtractedText(file);

    // Converte a lista de referência em um formato legível para a IA, limpando aspas duplas
    const refText =
      referenciaItens && referenciaItens.length > 0
        ? `\nITENS DO EMPENHO PARA MAPEAMENTO (UTILIZE ESTES IDs):\n${referenciaItens
            .map((i) => {
              const descClean =
                typeof i.descricao === "string"
                  ? i.descricao.replace(/"/g, "'")
                  : "";
              return `- ID: ${i.id} | Descrição: ${descClean} | Valor Unit: ${i.valor_unitario}`;
            })
            .join("\n")}`
        : "";

    // Mede se o documento possui texto real extraído (digital) ou é escaneado / imagem
    const textWithoutContext = extractedText.replace(/CONTEXTO DA ATA[^]*?--- INÍCIO DO BLOCO DE ITENS[^\n]*\n/, "");
    const cleanTextLength = textWithoutContext.replace(/--- Pág \d+ ---/g, "").trim().length;

    // =========================================================================
    // FLUXO A: DOCUMENTO ESCANEADO OU IMAGEM (cleanTextLength < 100)
    // O PDF não possui texto extraível pelo PDF.js.
    // Executa extração COMPLETA (cabeçalho + itens) em 1 chamada enviando o arquivo original (Base64).
    // =========================================================================
    if (cleanTextLength < 100) {
      console.log("[AI Debug] NF identificada como escaneada/imagem. Realizando extração completa de cabeçalho e itens via Visão (Base64)...");

      const promptNFScanned = `
      Você é um especialista em Notas Fiscais Eletrônicas (NF-e) no Brasil. 
      Sua tarefa é extrair os dados cadastrais (cabeçalho) E a lista completa de produtos/itens da Nota Fiscal fornecida e retornar um JSON estruturado.

      NÚMERO DA NF: Capture o número da nota fiscal (geralmente no topo direito, ex: Nº 000.003.550 ou 000.123.456).
      
      EMISSOR E DESTINATÁRIO: Identifique Razão Social e CNPJ de ambos.
      
      DATA DE EMISSÃO:
      Procure por "DATA DA EMISSÃO", "DATA EMISSÃO", "EMISSÃO", "DATA DE EMISSÃO" ou similar. 
      Este campo está geralmente localizado no bloco "DESTINATÁRIO / REMETENTE" no lado direito (próximo à data de saída e hora).
      Extraia e converta a data obrigatoriamente para o formato AAAA-MM-DD (por exemplo, "02/10/2025" deve ser retornado como "2025-10-02").
      
      PESQUISA POR NÚMERO DO EMPENHO:
      Procure exaustivamente por referências de empenho ou ordens de compra no texto.
      Verifique detalhadamente a seção "DADOS ADICIONAIS" ou "INFORMAÇÕES COMPLEMENTARES" (normalmente localizada no rodapé ou no final da Nota Fiscal).
      Procure por termos como "EMPENHO: 2025NE00544" ou "PEDIDO: XXXXX" ou "NE: XXXXX" e retorne apenas o número do empenho (ex: "2025NE00544") no campo "empenho_referencia". Se não encontrar nenhuma menção a empenho, retorne null.

      ${refText}

      REGRAS DE EXTRAÇÃO DOS ITENS:
      - Extraia absolutamente todos os itens da tabela "DADOS DO PRODUTO / SERVIÇO".
      - 'codigo': O código do produto na NF (coluna CÓDIGO DO PROD./SERV.).
      - 'descricao': A descrição do produto faturado (substitua qualquer aspa dupla por aspas simples).
      - 'quantidade': A quantidade faturada como STRING (ex: "30,000" ou "2.000,000").
      - 'unidade': A unidade (UN, LT, CX, FR, etc).
      - 'valor_unitario': O valor unitário como STRING (ex: "8,49000" ou "1,45000").
      - 'valor_total': O valor total do item como STRING (ex: "254,70" ou "2.900,00").
      - 'fator_embalagem': Fator de embalagem como STRING ou null.
      - 'id_item_empenho': Compara a descrição e valor unitário com a lista de empenhos fornecida acima e retorne o ID numérico correspondente se houver match claro, ou null.

      REGRAS DE FORMATAÇÃO:
      - NUNCA utilize aspas duplas (") dentro dos valores de texto ou descrições.
      - ECONOMIA DE TOKENS (CRÍTICO): Você DEVE retornar o JSON de forma estritamente minificada. NÃO inclua quebras de linha (\n) ou recuos.

      SCHEMA JSON OBRIGATÓRIO (RETORNE APENAS O JSON NO FORMATO ABAIXO, SEM COMENTÁRIOS OU EXPLICAÇÕES):
      {
        "sucesso": true,
        "numero_nf": string,
        "chave_acesso": string | null,
        "emissor": string | null,
        "destinatario": string | null,
        "empenho_referencia": string | null,
        "data_emissao": string | null,
        "valor_total_nf": string | null,
        "itens": [
          {
            "codigo": string,
            "descricao": string,
            "unidade": string,
            "quantidade": string,
            "valor_unitario": string,
            "valor_total": string,
            "fator_embalagem": string | null,
            "id_item_empenho": string | null
          }
        ]
      }
      `;

      const nfScannedSchema = {
        type: "OBJECT",
        properties: {
          sucesso: { type: "BOOLEAN" },
          numero_nf: { type: "STRING" },
          chave_acesso: { type: "STRING", nullable: true },
          emissor: { type: "STRING", nullable: true },
          destinatario: { type: "STRING", nullable: true },
          empenho_referencia: { type: "STRING", nullable: true },
          data_emissao: { type: "STRING", nullable: true },
          valor_total_nf: { type: "STRING", nullable: true },
          itens: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                codigo: { type: "STRING" },
                descricao: { type: "STRING" },
                unidade: { type: "STRING" },
                quantidade: { type: "STRING" },
                valor_unitario: { type: "STRING" },
                valor_total: { type: "STRING" },
                fator_embalagem: { type: "STRING", nullable: true },
                id_item_empenho: { type: "STRING", nullable: true },
              },
              required: [
                "codigo",
                "descricao",
                "unidade",
                "quantidade",
                "valor_unitario",
                "valor_total",
              ],
            },
          },
        },
        required: [
          "sucesso",
          "numero_nf",
          "chave_acesso",
          "emissor",
          "destinatario",
          "empenho_referencia",
          "data_emissao",
          "valor_total_nf",
          "itens",
        ],
      };

      const resultScanned = await analyzeWithAI(
        file,
        extractedText,
        promptNFScanned,
        nfScannedSchema,
        "pro",
      );

      if (!resultScanned || !resultScanned.sucesso) {
        throw new Error("Falha ao extrair dados da Nota Fiscal escaneada.");
      }

      const finalResultScanned = {
        sucesso: true,
        numero_nf: resultScanned.numero_nf,
        chave_acesso: resultScanned.chave_acesso,
        emissor: resultScanned.emissor,
        destinatario: resultScanned.destinatario,
        empenho_referencia: resultScanned.empenho_referencia,
        data_emissao: resultScanned.data_emissao,
        valor_total_nf: resultScanned.valor_total_nf,
        itens: Array.isArray(resultScanned.itens) ? resultScanned.itens : [],
      };

      if (finalResultScanned.valor_total_nf !== undefined) {
        finalResultScanned.valor_total_nf = parseBrazilianNumber(
          finalResultScanned.valor_total_nf,
        );
      }

      finalResultScanned.itens = finalResultScanned.itens.map((it: any) => ({
        ...it,
        quantidade: parseBrazilianNumber(it.quantidade),
        valor_unitario: parseBrazilianNumber(it.valor_unitario),
        valor_total: parseBrazilianNumber(it.valor_total),
        fator_embalagem: it.fator_embalagem
          ? parseBrazilianNumber(it.fator_embalagem)
          : null,
        id_item_empenho: it.id_item_empenho
          ? parseInt(String(it.id_item_empenho).replace(/\D/g, ""), 10) || null
          : null,
      }));

      console.log(
        `[AI Debug] Extração final da NF (escaneada) concluída. Total de itens: ${finalResultScanned.itens.length}`,
      );
      return finalResultScanned;
    }

    // =========================================================================
    // FLUXO B: DOCUMENTO COM TEXTO (DIGITAL)
    // Mantém o fluxo de 2 etapas (PASSO 1: Cabeçalho, PASSO 2: Loop por Páginas)
    // =========================================================================

    // PASSO 1: Extrair Cabeçalho/Totais (Usando o texto completo, porém apenas campos do cabeçalho)
    console.log("[AI Debug] Extraindo cabeçalho da Nota Fiscal...");
    const promptCabecalho = `
    Você é um especialista em Notas Fiscais Eletrônicas (NF-e) no Brasil. 
    Sua tarefa é extrair os dados cadastrais e globais (cabeçalho) do texto da Nota Fiscal fornecida e retornar um JSON estruturado.
    NÃO extraia a lista de itens.

    ECONOMIA DE TOKENS (CRÍTICO): Você DEVE retornar o JSON de forma estritamente minificada. NÃO inclua quebras de linha (\n), NÃO utilize recuos (indentação) e NÃO adicione espaços em branco desnecessários entre chaves e valores. O JSON deve ser uma string contínua.

    NÚMERO DA NF: Capture o número da nota fiscal (geralmente no topo direito, ex: Nº 000.003.550 ou 000.123.456).
    
    EMISSOR E DESTINATÁRIO: Identifique Razão Social e CNPJ de ambos.
    
    DATA DE EMISSÃO:
    Procure por "DATA DA EMISSÃO", "DATA EMISSÃO", "EMISSÃO", "DATA DE EMISSÃO" ou similar. 
    Este campo está geralmente localizado no bloco "DESTINATÁRIO / REMETENTE" no lado direito (próximo à data de saída e hora).
    Extraia e converta a data obrigatoriamente para o formato AAAA-MM-DD (por exemplo, "02/10/2025" deve ser retornado como "2025-10-02").
    
    PESQUISA POR NÚMERO DO EMPENHO:
    Procure exaustivamente por referências de empenho ou ordens de compra no texto.
    Verifique detalhadamente a seção "DADOS ADICIONAIS" ou "INFORMAÇÕES COMPLEMENTARES" (normalmente localizada no rodapé ou no final da Nota Fiscal).
    Procure por termos como "EMPENHO: 2025NE00544" ou "PEDIDO: XXXXX" ou "NE: XXXXX" e retorne apenas o número do empenho (ex: "2025NE00544") no campo "empenho_referencia". Se não encontrar nenhuma menção a empenho, retorne null.

    SCHEMA JSON OBRIGATÓRIO (RETORNE APENAS O JSON NO FORMATO ABAIXO, SEM COMENTÁRIOS OU EXPLICAÇÕES):
    {
      "sucesso": true,
      "numero_nf": string,
      "chave_acesso": string | null,
      "emissor": string | null,
      "destinatario": string | null,
      "empenho_referencia": string | null,
      "data_emissao": string | null,
      "valor_total_nf": string | null
    }
    `;

    const cabecalhoSchema = {
      type: "OBJECT",
      properties: {
        sucesso: { type: "BOOLEAN" },
        numero_nf: { type: "STRING" },
        chave_acesso: { type: "STRING", nullable: true },
        emissor: { type: "STRING", nullable: true },
        destinatario: { type: "STRING", nullable: true },
        empenho_referencia: { type: "STRING", nullable: true },
        data_emissao: { type: "STRING", nullable: true },
        valor_total_nf: { type: "STRING", nullable: true },
      },
      required: [
        "sucesso",
        "numero_nf",
        "chave_acesso",
        "emissor",
        "destinatario",
        "empenho_referencia",
        "data_emissao",
        "valor_total_nf",
      ],
    };

    const cabecalhoResult = await analyzeWithAI(
      file,
      extractedText,
      promptCabecalho,
      cabecalhoSchema,
      "flash",
    );
    if (!cabecalhoResult || !cabecalhoResult.sucesso) {
      throw new Error("Falha ao extrair o cabeçalho da Nota Fiscal.");
    }

    console.log(
      "[AI Debug] Cabeçalho extraído com sucesso:",
      cabecalhoResult.numero_nf,
    );

    // PASSO 2: Loop de Itens por Página (Chunking)
    // Dividimos o texto por marcas de página geradas na extração: "--- Pág i ---"
    let paginas = extractedText
      .split(/--- Pág \d+ ---/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paginas.length === 0 && extractedText.trim()) {
      paginas = [extractedText.trim()];
    }

    let todosOsItens: any[] = [];

    for (let idx = 0; idx < paginas.length; idx++) {
      const paginaTexto = paginas[idx];
      // Se a página for muito curta e não contiver caracteres relevantes de itens, podemos pular
      if (paginaTexto.length < 50) continue;

      console.log(
        `[AI Debug] Extraindo itens da página ${idx + 1}/${paginas.length}...`,
      );

      const promptItens = `
      Você é um especialista em extração de itens de Notas Fiscais Eletrônicas brasileiras.
      Sua tarefa é extrair todos os itens da tabela de produtos presentes no texto da página fornecida.

      DADOS DE CONTEXTO DA NF (Para referência):
      - Emissor: ${cabecalhoResult.emissor}
      - Número da NF: ${cabecalhoResult.numero_nf}

      ${refText}

      REGRAS DE EXTRAÇÃO:
      - Extraia absolutamente todos os itens da tabela de produtos presentes no texto desta página.
      - 'codigo': O código do produto na NF.
      - 'descricao': A descrição do produto faturado (substitua qualquer aspa dupla por aspas simples).
      - 'quantidade': A quantidade faturada como STRING (ex: "1.500,00").
      - 'unidade': A unidade (UN, CX, FR, etc).
      - 'valor_unitario': O valor unitário como STRING.
      - 'valor_total': O valor total do item como STRING.
      - 'fator_embalagem': Fator de embalagem como STRING ou null.
      - 'id_item_empenho': Compara a descrição e valor unitário com a lista de empenhos fornecida acima e retorne o ID numérico correspondente se houver match claro, ou null.

      REGRAS DE FORMATAÇÃO:
      - NUNCA utilize aspas duplas (") dentro dos valores de texto ou descrições. Se a aspa existir no documento original, substitua obrigatoriamente por aspas simples (') ou omita a aspa. O JSON gerado deve ser perfeitamente válido.
      - ECONOMIA DE TOKENS (CRÍTICO): Você DEVE retornar o JSON de forma estritamente minificada. NÃO inclua quebras de linha (\n), NÃO utilize recuos (indentação) e NÃO adicione espaços em branco desnecessários entre chaves e valores. O JSON deve ser uma string contínua.

      SCHEMA JSON OBRIGATÓRIO (RETORNE APENAS O JSON NO FORMATO ABAIXO, SEM COMENTÁRIOS OU EXPLICAÇÕES):
      {
        "sucesso": true,
        "itens": [
          {
            "codigo": string,
            "descricao": string,
            "unidade": string,
            "quantidade": string,
            "valor_unitario": string,
            "valor_total": string,
            "fator_embalagem": string | null,
            "id_item_empenho": string | null
          }
        ]
      }
      `;

      const itensSchema = {
        type: "OBJECT",
        properties: {
          sucesso: { type: "BOOLEAN" },
          itens: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                codigo: { type: "STRING" },
                descricao: { type: "STRING" },
                unidade: { type: "STRING" },
                quantidade: { type: "STRING" },
                valor_unitario: { type: "STRING" },
                valor_total: { type: "STRING" },
                fator_embalagem: { type: "STRING", nullable: true },
                id_item_empenho: { type: "STRING", nullable: true },
              },
              required: [
                "codigo",
                "descricao",
                "unidade",
                "quantidade",
                "valor_unitario",
                "valor_total",
              ],
            },
          },
        },
        required: ["sucesso", "itens"],
      };

      try {
        const resultItens = await analyzeWithAI(
          file,
          paginaTexto,
          promptItens,
          itensSchema,
        );
        if (resultItens && Array.isArray(resultItens.itens)) {
          console.log(
            `[AI Debug] Extraídos ${resultItens.itens.length} itens da página ${idx + 1}.`,
          );
          todosOsItens = [...todosOsItens, ...resultItens.itens];
        }
      } catch (err) {
        console.error(
          `[AI Debug] Erro ao processar itens da página ${idx + 1}:`,
          err,
        );
        throw err;
      }
    }

    // PASSO 3: Formatação de Saída unificada
    const finalResult = {
      sucesso: true,
      numero_nf: cabecalhoResult.numero_nf,
      chave_acesso: cabecalhoResult.chave_acesso,
      emissor: cabecalhoResult.emissor,
      destinatario: cabecalhoResult.destinatario,
      empenho_referencia: cabecalhoResult.empenho_referencia,
      data_emissao: cabecalhoResult.data_emissao,
      valor_total_nf: cabecalhoResult.valor_total_nf,
      itens: todosOsItens,
    };

    if (finalResult.valor_total_nf !== undefined) {
      finalResult.valor_total_nf = parseBrazilianNumber(
        finalResult.valor_total_nf,
      );
    }

    finalResult.itens = finalResult.itens.map((it: any) => ({
      ...it,
      quantidade: parseBrazilianNumber(it.quantidade),
      valor_unitario: parseBrazilianNumber(it.valor_unitario),
      valor_total: parseBrazilianNumber(it.valor_total),
      fator_embalagem: it.fator_embalagem
        ? parseBrazilianNumber(it.fator_embalagem)
        : null,
      id_item_empenho: it.id_item_empenho
        ? parseInt(String(it.id_item_empenho).replace(/\D/g, ""), 10) || null
        : null,
    }));

    console.log(
      `[AI Debug] Extração final da NF concluída. Total de itens: ${finalResult.itens.length}`,
    );
    return finalResult;
  } catch (error) {
    console.error("Erro na extração da NF:", error);
    return null;
  }
}

// --- 5. Extração de Pedido / Reserva de Pedido / DAV ---
export async function extrairDadosPedido(file: File) {
  try {
    const extractedText = await getExtractedText(file);

    const textWithoutContext = extractedText.replace(/CONTEXTO DA ATA[^]*?--- INÍCIO DO BLOCO DE ITENS[^\n]*\n/, "");
    const cleanTextLength = textWithoutContext.replace(/--- Pág \d+ ---/g, "").trim().length;

    // FLUXO A: DOCUMENTO ESCANEADO OU IMAGEM (cleanTextLength < 100)
    if (cleanTextLength < 100) {
      console.log("[AI Debug] Pedido/DAV identificado como escaneado/imagem. Realizando extração completa via Visão (Base64)...");

      const promptPedidoScanned = `
      Você é um extrator de dados logísticos e comerciais. Leia o documento (Pedido, Reserva de Pedido ou Documento Auxiliar de Venda - DAV) e extraia os dados cadastrais (cabeçalho) E a lista completa de produtos/itens.

      REGRAS DO CABEÇALHO:
      - numero_pedido: Capture o número do pedido ou ordem. Em documentos "RESERVA DE PEDIDO", busque por "Pedido Nº: XXXX". Em DAVs, busque após "DAVN.:" ou "DAV:".
      - cliente: Capture o nome do cliente / prefeitura / órgão.
      - cnpj_cliente: Capture o CNPJ do cliente se houver.
      - numero_empenho_referencia: Referências de ATA ou Empenho.
      - data_emissao: Data do documento em YYYY-MM-DD.
      - valor_total_pedido: Valor total global como STRING.

      REGRAS DOS ITENS:
      - Extraia todos os itens da tabela de produtos listados.
      - codigo_produto, descricao, unidade_medida, marca, quantidade (STRING), valor_unitario (STRING), lote, validade.
      - quantidade e valor_unitario DEVEM ser retornados como STRING com a formatação original.
      - ECONOMIA DE TOKENS (CRÍTICO): Retorne JSON minificado.

      SCHEMA JSON OBRIGATÓRIO:
      {
        "sucesso": true,
        "tipo_documento": "PEDIDO",
        "numero_pedido": string | null,
        "numero_empenho_referencia": string | null,
        "data_emissao": string | null,
        "cliente": string | null,
        "cnpj_cliente": string | null,
        "valor_total_pedido": string,
        "itens": [
          {
            "codigo_produto": string,
            "descricao": string,
            "quantidade": string,
            "valor_unitario": string,
            "unidade_medida": string,
            "marca": string | null,
            "lote": string | null,
            "validade": string | null
          }
        ]
      }
      `;

      const pedidoScannedSchema = {
        type: "OBJECT",
        properties: {
          sucesso: { type: "BOOLEAN" },
          tipo_documento: { type: "STRING" },
          numero_pedido: { type: "STRING", nullable: true },
          numero_empenho_referencia: { type: "STRING", nullable: true },
          data_emissao: { type: "STRING", nullable: true },
          cliente: { type: "STRING", nullable: true },
          cnpj_cliente: { type: "STRING", nullable: true },
          valor_total_pedido: { type: "STRING" },
          itens: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                codigo_produto: { type: "STRING" },
                descricao: { type: "STRING" },
                quantidade: { type: "STRING" },
                valor_unitario: { type: "STRING" },
                unidade_medida: { type: "STRING" },
                marca: { type: "STRING", nullable: true },
                lote: { type: "STRING", nullable: true },
                validade: { type: "STRING", nullable: true },
              },
              required: [
                "codigo_produto",
                "descricao",
                "quantidade",
                "valor_unitario",
                "unidade_medida",
              ],
            },
          },
        },
        required: ["sucesso", "valor_total_pedido", "itens"],
      };

      const resultScanned = await analyzeWithAI(
        file,
        extractedText,
        promptPedidoScanned,
        pedidoScannedSchema,
        "pro",
      );

      if (!resultScanned || !resultScanned.sucesso) {
        throw new Error("Falha ao extrair dados do Pedido escaneado.");
      }

      const numeroDoc = resultScanned.numero_pedido || null;
      const valorTotalDoc = resultScanned.valor_total_pedido;

      const finalResultScanned = {
        sucesso: true,
        tipo_documento: "PEDIDO",
        numero_pedido: numeroDoc,
        numero_dav: numeroDoc,
        numero_empenho_referencia: resultScanned.numero_empenho_referencia,
        data_emissao: resultScanned.data_emissao,
        cliente: resultScanned.cliente,
        cnpj_cliente: resultScanned.cnpj_cliente,
        valor_total_pedido: valorTotalDoc,
        valor_total_dav: valorTotalDoc,
        itens: Array.isArray(resultScanned.itens) ? resultScanned.itens : [],
        confianca_analise: 100,
      };

      if (finalResultScanned.valor_total_pedido !== undefined) {
        finalResultScanned.valor_total_pedido = parseBrazilianNumber(
          finalResultScanned.valor_total_pedido,
        );
        finalResultScanned.valor_total_dav = finalResultScanned.valor_total_pedido;
      }

      finalResultScanned.itens = finalResultScanned.itens.map((it: any) => ({
        ...it,
        quantidade: parseBrazilianNumber(it.quantidade),
        valor_unitario: parseBrazilianNumber(it.valor_unitario),
      }));

      console.log(
        `[AI Debug] Extração final do Pedido (escaneado) concluída. Total de itens: ${finalResultScanned.itens.length}`,
      );
      return finalResultScanned;
    }

    // FLUXO B: DOCUMENTO COM TEXTO (DIGITAL)
    console.log("[AI Debug] Extraindo cabeçalho do Pedido/Reserva...");
    const promptCabecalho = `
    Você é um extrator de dados logísticos e comerciais. Leia o texto extraído deste documento (Pedido, Reserva de Pedido ou Documento Auxiliar de Venda - DAV) e extraia apenas os dados cadastrais e globais (cabeçalho).
    NÃO extraia a lista de itens.

    ECONOMIA DE TOKENS (CRÍTICO): Você DEVE retornar o JSON de forma estritamente minificada. NÃO inclua quebras de linha (\n), NÃO utilize recuos (indentação) e NÃO adicione espaços em branco desnecessários entre chaves e valores. O JSON deve ser uma string contínua.

    REGRAS:
    - numero_pedido: Capture o número do pedido ou ordem. Em documentos "RESERVA DE PEDIDO" (como modelos ROSAFARM/WSGE), busque por "Pedido Nº: XXXX" (ex: "4797" ou "4563"). Em "ORDEM DE FORNECIMENTO", busque por "ORDEM DE FORNECIMENTO 4265/2026". Em DAVs, busque após "DAVN.:" ou "DAV:".
    - cliente: Capture o nome do cliente / prefeitura / órgão (ex: "FUNDO MUNICIPAL DE SAUDE DE MONTE DO CARMO - TO - 180", "Prefeitura Municipal de Marcelândia - MT" ou "MUNICIPIO DE COLIDER - MT").
    - cnpj_cliente: Capture o CNPJ do cliente se houver (ex: "00.000.000/0001-98" ou "00.000.000/0001-97").
    - numero_empenho_referencia: Procure em "Obs. do Pedido", "Informações Orçamentárias", "Número ARP", "ATA DE REGISTRO DE PREÇOS" por referências de ATA ou Empenho (ex: "ATA DE REGISTRO DE PREÇOS Nº: 002/2026", "PREGÃO ELETRÔNICO Nº: 001/2026", "ORDEM DE FORNECIMENTO: 4265/2026", "EMPENHO: 12174/2026"). Capture a referência limpa.
    - data_emissao: Capture a data do documento (ex: "23/07/2026", "21/07/2026", "16/04/2026" ou "Palmas, 23 de julho de 2026") e converta para YYYY-MM-DD.
    - valor_total_pedido: Valor total global do pedido / reserva de pedido (ex: "Valor Total do Pedido: R$ 23.293,70" -> "23293.70", "30269.78" ou "419.50") como STRING.
    `;

    const cabecalhoSchema = {
      type: "OBJECT",
      properties: {
        sucesso: { type: "BOOLEAN" },
        tipo_documento: { type: "STRING" },
        numero_pedido: { type: "STRING", nullable: true },
        numero_empenho_referencia: { type: "STRING", nullable: true },
        data_emissao: { type: "STRING", nullable: true },
        cliente: { type: "STRING", nullable: true },
        cnpj_cliente: { type: "STRING", nullable: true },
        valor_total_pedido: { type: "STRING" },
      },
      required: ["sucesso", "valor_total_pedido"],
    };

    const cabecalhoResult = await analyzeWithAI(
      file,
      extractedText,
      promptCabecalho,
      cabecalhoSchema,
    );
    if (!cabecalhoResult || !cabecalhoResult.sucesso) {
      throw new Error("Falha ao extrair o cabeçalho do Pedido.");
    }

    console.log(
      "[AI Debug] Cabeçalho do Pedido extraído com sucesso:",
      cabecalhoResult.numero_pedido,
    );

    // Loop de itens por página
    let paginas = extractedText
      .split(/--- Pág \d+ ---/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paginas.length === 0 && extractedText.trim()) {
      paginas = [extractedText.trim()];
    }

    let todosOsItens: any[] = [];

    for (let idx = 0; idx < paginas.length; idx++) {
      const paginaTexto = paginas[idx];
      if (paginaTexto.length < 50) continue;

      console.log(
        `[AI Debug] Extraindo itens do Pedido - página ${idx + 1}/${paginas.length}...`,
      );

      const promptItens = `
      Você é um extrator de dados de itens de Pedido / Reserva de Pedido / DAV.
      Sua tarefa é extrair todos os itens de produtos presentes no texto da página fornecida.

      DADOS DE CONTEXTO DO PEDIDO:
      - Número do Pedido: ${cabecalhoResult.numero_pedido}
      - Cliente: ${cabecalhoResult.cliente}

      REGRAS:
      - Extraia todos os itens da tabela de produtos listados nesta página.
      - Na lista de itens:
        * codigo_produto: Código do item (ex: "342544" ou "MD-004-00000026").
        * descricao: Nome/descrição principal do produto (ex: "LENÇOL DE PAPEL 70CMX50M"). CUIDADO: Se houver uma coluna "Desc.", ela significa DESCONTO, JAMAIS use como descrição do produto!
        * unidade_medida: Apresentação ou unidade (ex: "PC 8 UN", "UN", "CX", "AMP").
        * marca: Nome da marca se houver (ex: "Inovato").
        * quantidade: Quantidade do produto na coluna Qtd como STRING (ex: "3460" ou "50,0000"). ATENÇÃO CRÍTICA: A quantidade de produto é a coluna Qtd (ex: 3460). JAMAIS CONFUNDA COM O VALOR TOTAL OU DESCONTO!
        * valor_unitario: Valor unitário do produto na coluna Vl.Unit como STRING (ex: "1,14" ou "8,3900").
        * valor_total: Valor total do item na coluna Vl.Total como STRING (ex: "3944,40").
        * lote: Número do lote se constar no item (ex: "25070644").
        * validade: Data de validade se constar no item (ex: "29/07/2027").
      - quantidade, valor_unitario e valor_total DEVEM ser retornados como STRING com a formatação original do documento.
      - ECONOMIA DE TOKENS (CRÍTICO): Você DEVE retornar o JSON de forma estritamente minificada.

      SCHEMA JSON OBRIGATÓRIO (RETORNE APENAS O JSON NO FORMATO ABAIXO, SEM COMENTÁRIOS OU EXPLICAÇÕES):
      {
        "sucesso": true,
        "itens": [
          {
            "codigo_produto": string,
            "descricao": string,
            "quantidade": string,
            "valor_unitario": string,
            "valor_total": string,
            "unidade_medida": string,
            "marca": string,
            "lote": string,
            "validade": string
          }
        ]
      }
      `;

      const itensSchema = {
        type: "OBJECT",
        properties: {
          sucesso: { type: "BOOLEAN" },
          itens: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                codigo_produto: { type: "STRING" },
                descricao: { type: "STRING" },
                quantidade: { type: "STRING" },
                valor_unitario: { type: "STRING" },
                valor_total: { type: "STRING", nullable: true },
                unidade_medida: { type: "STRING" },
                marca: { type: "STRING", nullable: true },
                lote: { type: "STRING", nullable: true },
                validade: { type: "STRING", nullable: true },
              },
              required: [
                "codigo_produto",
                "descricao",
                "quantidade",
                "valor_unitario",
                "unidade_medida",
              ],
            },
          },
        },
        required: ["sucesso", "itens"],
      };

      try {
        const resultItens = await analyzeWithAI(
          file,
          paginaTexto,
          promptItens,
          itensSchema,
        );
        if (resultItens && Array.isArray(resultItens.itens)) {
          console.log(
            `[AI Debug] Extraídos ${resultItens.itens.length} itens do Pedido na página ${idx + 1}.`,
          );
          todosOsItens = [...todosOsItens, ...resultItens.itens];
        }
      } catch (err) {
        console.error(
          `[AI Debug] Erro ao extrair itens do Pedido na página ${idx + 1}:`,
          err,
        );
        throw err;
      }
    }

    const numeroDoc = cabecalhoResult.numero_pedido || null;
    const valorTotalDoc = cabecalhoResult.valor_total_pedido;

    const finalResult = {
      sucesso: true,
      tipo_documento: "PEDIDO",
      numero_pedido: numeroDoc,
      numero_dav: numeroDoc, // para retrocompatibilidade com componentes legados
      numero_empenho_referencia: cabecalhoResult.numero_empenho_referencia,
      data_emissao: cabecalhoResult.data_emissao,
      cliente: cabecalhoResult.cliente,
      cnpj_cliente: cabecalhoResult.cnpj_cliente,
      valor_total_pedido: valorTotalDoc,
      valor_total_dav: valorTotalDoc, // retrocompatibilidade
      itens: todosOsItens,
      confianca_analise: 100,
    };

    if (finalResult.valor_total_pedido !== undefined) {
      finalResult.valor_total_pedido = parseBrazilianNumber(
        finalResult.valor_total_pedido,
      );
      finalResult.valor_total_dav = finalResult.valor_total_pedido;
    }
    if (finalResult.confianca_analise !== undefined) {
      finalResult.confianca_analise = parseBrazilianNumber(
        finalResult.confianca_analise,
      );
    }

    finalResult.itens = finalResult.itens.map((it: any) => {
      let qtd = parseBrazilianNumber(it.quantidade);
      let vUnit = parseBrazilianNumber(it.valor_unitario);
      let total = parseBrazilianNumber(it.valor_total || it.precototal || it.valortotal);

      // Autocorreção Matemática Inteligente (Self-Healing Parser)
      if (vUnit > 0 && total > 0) {
        const calculatedQtd = Math.round(total / vUnit);
        if (Math.abs(calculatedQtd * vUnit - total) < 0.05 && Math.abs(qtd * vUnit - total) > 0.1) {
          console.log(`[AI Self-Healing Pedido] Qtd corrigida de ${qtd} para ${calculatedQtd} (Baseado no total R$ ${total} / unit R$ ${vUnit})`);
          qtd = calculatedQtd;
        }
      }

      return {
        ...it,
        quantidade: qtd,
        valor_unitario: vUnit,
      };
    });

    console.log(
      `[AI Debug] Extração final do Pedido concluída. Total de itens: ${finalResult.itens.length}`,
    );
    return finalResult;
  } catch (error) {
    console.error("Erro na extração do Pedido:", error);
    return null;
  }
}

// Retrocompatibilidade
export const extrairDadosDAV = extrairDadosPedido;

// --- 6. Extração de Nota de Empenho (NE) / Ordem de Compra ---
export async function extrairDadosEmpenho(file: File) {
  try {
    const extractedText = await getExtractedText(file);

    const promptEmpenho = `
Você é um especialista em extração de dados de documentos públicos brasileiros (Notas de Empenho e Ordens de Compra).
Sua missão é ler o texto extraído do PDF e retornar um objeto JSON perfeitamente estruturado, seguindo ESTRITAMENTE as regras abaixo.

=== 1. DADOS DO CABEÇALHO (ÓRGÃO EMISSOR E DOCUMENTO) ===
- numero_ne: Extraia o número da Nota de Empenho ou Ordem de Compra.
- tipo_documento: Defina se é "Empenho" ou "Ordem de Compra".
- orgao_emissor: Identifique o nome completo do órgão público comprador, o CNPJ do órgão, Município, UF e CEP (se houver). Certifique-se de extrair os dados cadastrais do COMPRADOR (órgão público/prefeitura que emitiu o documento), e NUNCA do fornecedor/empresa contratada.
- valor_total_documento: O valor global financeiro do documento.

=== 2. DADOS DOS ITENS (TABELA DE PRODUTOS) ===
- EXTRAÇÃO COMPLETA DE ITENS: Extraia TODOS os itens de produtos e medicamentos listados na especificação do documento (Ordem de Fornecimento, Nota de Empenho ou Ordem de Compra), independente de qual seja a razão social do fornecedor (ex: ALTO URUGUAI, ROSAFARM, NEXUS, etc.). NUNCA retorne a lista de itens vazia se houver produtos na tabela.

=== 3. REGRAS ANTI-ALUCINAÇÃO E FORMATAÇÃO DE TABELAS (MUITO IMPORTANTE) ===
- EVITAR DADOS DO FORNECEDOR E ALUCINAÇÕES GEOGRÁFICAS NO ÓRGÃO EMISSOR: O documento contém dados do fornecedor/vencedor (ex: ALTO URUGUAI, ROSAFARM, etc.). JAMAIS use a cidade ou CNPJ do fornecedor como sendo do órgão emissor. O município e UF do orgao_emissor devem refletir única e exclusivamente a localização do órgão público comprador (ex: "Prefeitura Municipal de Marcelândia - MT" -> Município: "Marcelândia", UF: "MT").
- RECONHECIMENTO E MAPEAMENTO DE COLUNAS:
  * 'Código' / 'Seq.': Código do item (ex: "342544").
  * 'Descrição' / 'Especificação' / 'Produto': Nome/descrição principal do item. Se houver especificação complementar nas linhas subsequentes, concatene-as para formar a descrição completa do produto.
  * 'Marca': Marca do produto (ex: "Inovato"). Se houver complemento de especificação na coluna Marca, extraia a marca principal ("Inovato").
  * 'Unidade': Unidade de medida (ex: "PC 8 UN", "CX 25 UN", "CX 100 UN", "EMBL1UND").
  * 'Quantidade': Quantidade numérica COMPRADA (ex: "10,0000" -> 10, "50,0000" -> 50).
  * 'Preço Unitario' / 'Valor Unitario' / 'Vlr.unitário': Preço unitário individual do produto (ex: "R$ 8,3900" -> 8.39).
  * 'Valor' / 'Valor Total' / 'Vlr.total': Valor total da linha (ex: "R$ 419,50" -> 419.50).
  * 'Desc.': ATENÇÃO: Esta coluna significa DESCONTO! JAMAIS utilize a coluna 'Desc.' como descrição do produto.
- COLUNAS COMBINADAS / AGRUPADAS (MUITO IMPORTANTE):
  * Se a quantidade e a unidade estiverem agrupadas na mesma coluna (ex: "Quant./Unidade", "Qtd/Un", "Quant./Unid."), como no valor "20,0000 TUBO" ou "100 CX", extraia a parte numérica (ex: "20,0000") como a 'quantidade', e a parte textual (ex: "TUBO") como a 'unidade'.
- NÚMEROS COM 4 CASAS DECIMAIS: Muitas prefeituras imprimem números com 4 casas decimais. Exemplo: '50,0000' significa EXATAS 50 unidades. '8,3900' significa R$ 8,39. Leia o valor real corretamente ignorando zeros irrelevantes após a vírgula.
- VALOR UNITÁRIO SOBERANO E CONSISTÊNCIA MATEMÁTICA: O valor unitário impresso na tabela de produtos é individual e soberano. NUNCA confunda 'Preço Unitario' com 'Valor Total'. Valide sempre que quantidade × valor_unitario = valor_total da linha!

=== 4. DADOS DO FORNECEDOR CONTRATADO ===
- fornecedor.nome: Identifique a Razão Social ou Nome Fantasia da empresa fornecedora/vencedora citada no documento (ex: "ALTO URUGUAI COMÉRCIO DE PRODUTOS HOSPITALARES LTDA", "ROSAFARM DISTRIBUIDORA DE MEDICAMENTOS LTDA", "NEXUS", etc.).
- fornecedor.cnpj: CNPJ do fornecedor se houver.

=== 5. SAÍDA DE DADOS ===
Retorne APENAS um JSON válido e minificado que cumpra o schema exigido. NÃO inclua formatação markdown, textos explicativos ou quebras de linha fora do JSON.
`;

    const empenhoSchema = {
      type: "OBJECT",
      properties: {
        sucesso: { type: "BOOLEAN" },
        tipo_documento: { type: "STRING" },
        numero_ne: { type: "STRING" },
        valor_total_documento: { type: "STRING" },
        data_emissao: { type: "STRING", nullable: true },
        prazo_entrega: { type: "STRING", nullable: true },
        fornecedor: {
          type: "OBJECT",
          properties: {
            nome: { type: "STRING", nullable: true },
            cnpj: { type: "STRING", nullable: true }
          }
        },
        orgao_emissor: {
          type: "OBJECT",
          properties: {
            nome: { type: "STRING" },
            cnpj: { type: "STRING" },
            municipio: { type: "STRING" },
            estado: { type: "STRING" },
            regiao: { type: "STRING", nullable: true },
            cep: { type: "STRING", nullable: true },
          },
          required: ["nome"],
        },
        itens: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              descricao: { type: "STRING" },
              quantidade: { type: "STRING" },
              unidade: { type: "STRING" },
              valor_unitario: { type: "STRING" },
              valor_total: { type: "STRING" },
              marca: { type: "STRING", nullable: true },
              lote: { type: "STRING", nullable: true },
              codigo_item: { type: "STRING", nullable: true },
              categoria: { type: "STRING" },
              codigo_mapeamento_ia: { type: "STRING", nullable: true },
            },
            required: ["descricao", "quantidade", "unidade", "valor_unitario"],
          },
        },
      },
      required: [
        "sucesso",
        "tipo_documento",
        "numero_ne",
        "valor_total_documento",
        "data_emissao",
        "fornecedor",
        "orgao_emissor",
        "itens",
      ],
    };

    const result = await analyzeWithAI(
      file,
      extractedText,
      promptEmpenho,
      empenhoSchema,
      "flash",
    );
    if (result) {
      const fornecedorNome = result.fornecedor?.nome || result.fornecedor_nome || '';
      const fornecedorCnpj = result.fornecedor?.cnpj || result.fornecedor_cnpj || '';
      
      const checkFornecedorValido = (nome: string, cnpj: string) => {
        if (!nome && !cnpj) return true;
        const normNome = nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normCnpj = cnpj.replace(/\D/g, '');
        
        if (normNome.includes('ROSAFARM') || normNome.includes('ROSAFARMA')) return true;
        if (normNome.includes('NEXUS') || normNome.includes('APROMED')) return true;
        if (normCnpj.includes('37676047') || normCnpj.includes('54582493')) return true;
        return false;
      };

      result.fornecedor_valido = checkFornecedorValido(fornecedorNome, fornecedorCnpj);
      result.fornecedor_nome_detectado = fornecedorNome || 'Empresa terceira';

      if (result.valor_total_documento !== undefined) {
        result.valor_total_documento = parseBrazilianNumber(
          result.valor_total_documento,
        );
      }
      if (Array.isArray(result.itens)) {
        result.itens = result.itens.map((it: any) => {
          let qtd = parseBrazilianNumber(it.quantidade);
          const unit = parseBrazilianNumber(it.valor_unitario);
          let total = it.valor_total
            ? parseBrazilianNumber(it.valor_total)
            : qtd * unit;

          // Validação e auto-correção matemática de quantidade:
          // Se a IA confundiu a apresentação (ex: "CX 25 UN") com a quantidade comprada (ex: 10),
          // e o total da linha / preço unitário indicar a quantidade real esperada, corrigimos automaticamente.
          if (unit > 0 && total > 0) {
            const qtdEsperada = total / unit;
            const diffActual = Math.abs(qtd * unit - total);
            if (diffActual > 0.05 && Math.abs(qtdEsperada * unit - total) <= 0.05) {
              console.warn(
                `[AI Correction] Correção de quantidade por divergência matemática no item "${it.descricao}": Qtd original=${qtd}, Unit=${unit}, Total=${total}. Qtd corrigida para ${qtdEsperada}`
              );
              qtd = Math.round(qtdEsperada * 10000) / 10000;
            }
          }

          return {
            ...it,
            quantidade: qtd,
            valor_unitario: unit,
            valor_total: total,
          };
        });
      }
    }
    return result;
  } catch (error) {
    console.error("Erro na extração do Empenho:", error);
    return null;
  }
}
