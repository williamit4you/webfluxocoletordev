export type DanfeReadResult = {
  fields: Record<string, unknown>;
  warnings: string[];
};

type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (source: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
      }>;
    }>;
  };
};

type DanfeReaderWindow = Window & {
  pdfjsLib?: PdfJsLib;
  __pdfJsLoader?: Promise<PdfJsLib>;
};

const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_JS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function extractDigits(value: string) {
  return value.replace(/\D+/g, "");
}

function onlyText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupValue(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s+([,.;:/-])/g, "$1").trim();
}

function splitLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(line => cleanupValue(line))
    .filter(Boolean);
}

function normalizeMoneyValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d+(?:\.\d{4})$/.test(trimmed) || /^\d{1,3}(?:,\d{3})+\.\d{4}$/.test(trimmed)) {
    const parsed = Number(trimmed.replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return formatCurrency(parsed);
    }
  }

  if (/^\d+\.\d{2}$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return formatCurrency(parsed);
    }
  }

  return trimmed;
}

function normalizeNumericIdentifier(value: string) {
  const digits = extractDigits(value);
  if (!digits) {
    return "";
  }

  const normalized = digits.replace(/^0+/, "");
  return normalized || "0";
}

function formatCnpj(value: string) {
  const digits = extractDigits(value);
  if (digits.length !== 14) {
    return value.trim();
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function toCurrencyNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateForInput(value: string) {
  const date = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (date) {
    return `${date[3]}-${date[2]}-${date[1]}`;
  }

  const compact = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  return "";
}

function findFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanupValue(match[1]);
    }
  }

  return "";
}

function findAccessKey(text: string) {
  const matches = text.match(/(?:\d[\s.-]*){44}/g) ?? [];
  for (const match of matches) {
    const digits = extractDigits(match);
    if (digits.length === 44) {
      return digits;
    }
  }

  return "";
}

function findHighestCurrency(text: string) {
  const values = [...text.matchAll(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g)]
    .map(match => toCurrencyNumber(match[0]))
    .filter((value): value is number => value != null);

  if (values.length === 0) {
    return "";
  }

  return formatCurrency(Math.max(...values));
}

function findEmitenteName(text: string) {
  const normalized = normalizeText(text);
  const received = normalized.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i)?.[1];
  if (received) {
    return cleanupValue(received);
  }

  const cnpjIndex = normalized.search(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
  if (cnpjIndex > 0) {
    const beforeCnpj = normalized.slice(0, cnpjIndex);
    const company = beforeCnpj.match(/([A-Z0-9][A-Z0-9 &./-]{6,}S\/A)\s*$/i)?.[1];
    if (company) {
      return cleanupValue(company);
    }
  }

  return "";
}

function findEmitenteCnpj(text: string) {
  const normalized = normalizeText(text);
  const labeled = normalized.match(/CNPJ(?:\/CPF)?\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i)?.[1];
  if (labeled) {
    return labeled;
  }

  const cnpj = normalized.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/)?.[0];
  return cnpj ?? "";
}

function findInscricaoEstadual(text: string) {
  const normalized = normalizeText(text);
  const afterLabel = normalized.match(/INSCRICAO ESTADUAL\s+(\d{8,14})/i)?.[1];
  if (afterLabel) {
    return afterLabel;
  }

  const candidates = [...normalized.matchAll(/\b\d{9,14}\b/g)].map(match => match[0]);
  return candidates.find(candidate => candidate.length >= 9 && candidate.length <= 14) ?? "";
}

function findCep(text: string) {
  const normalized = normalizeText(text);
  const labeled = normalized.match(/CEP[:\s-]*(\d{5})[-.\s]?(\d{3})/i);
  if (labeled) {
    return `${labeled[1]}${labeled[2]}`;
  }

  const anyCep = normalized.match(/\b(\d{5})[-.\s]?(\d{3})\b/);
  return anyCep ? `${anyCep[1]}${anyCep[2]}` : "";
}

function findUf(text: string) {
  const normalized = normalizeText(text);
  const nearCep = normalized.match(/\b([A-Z]{2})\s*-\s*CEP/i)?.[1];
  if (nearCep) {
    return nearCep;
  }

  return normalized.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)?.[1] ?? "";
}

function findEmissionDate(text: string) {
  const normalized = normalizeText(text);
  const labeled = findFirst(normalized, [
    /DATA DE EMISSAO\s+(\d{2}\/\d{2}\/\d{4})/i,
    /EMISSAO\s+(\d{2}\/\d{2}\/\d{4})/i,
    /DATA\s+DI?\s*(\d{2}\/\d{2}\/\d{4})/i
  ]);

  if (labeled) {
    return formatDateForInput(labeled);
  }

  const anyDate = normalized.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0] ?? "";
  return formatDateForInput(anyDate);
}

function findHeaderFields(text: string, accessKey: string) {
  const normalized = normalizeText(text);
  const numero = normalizeNumericIdentifier(findFirst(normalized, [
    /NF-e\s*(?:N[oO]|No|N)?\s*[:.-]?\s*(\d{1,9})/i,
    /N(?:U|Ú)MERO\s*[:.-]?\s*(\d{1,9})/i,
    /N[º°]\s*[:.-]?\s*(\d{1,9})/i
  ]));
  const serie = normalizeNumericIdentifier(findFirst(normalized, [
    /S(?:E|É)RIE\s*[:.-]?\s*(\d{1,3})/i,
    /\bSER\s*[:.-]?\s*(\d{1,3})\b/i
  ]));

  if (accessKey.length === 44) {
    const serieFromAccessKey = normalizeNumericIdentifier(accessKey.slice(22, 25));
    const numeroFromAccessKey = normalizeNumericIdentifier(accessKey.slice(25, 34));

    return {
      numero: numero || numeroFromAccessKey,
      serie: serie || serieFromAccessKey
    };
  }

  return { numero, serie };
}

function findNaturezaOperacao(text: string) {
  return findFirst(normalizeText(text), [
    /NATUREZA DA OPERACAO\s+(.+?)(?:\s+PROTOCOLO|\s+INSCRICAO|\s+CHAVE DE ACESSO|$)/i
  ]);
}

function isDanfeItemsFooter(line: string) {
  return /dados adicionais|calculo do imposto|transportador|cobranca|informacoes complementares|valor bc-st|valor icms-st/i.test(line);
}

function isNcmToken(value: string) {
  return /^\d{8}$/.test(extractDigits(value));
}

function isCfopToken(value: string) {
  return /^\d{4}$/.test(extractDigits(value));
}

function isCstToken(value: string) {
  return /^\d{2,3}$/.test(extractDigits(value));
}

function isUnitToken(value: string) {
  return /^[A-Z]{1,5}$/.test(value.trim().toUpperCase());
}

function isQuantityToken(value: string) {
  return /^\d+(?:[.,]\d+)?$/.test(value.trim());
}

function isMoneyToken(value: string) {
  return /^\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2,4})$/.test(value.trim()) || /^\d+[.,]\d{2,4}$/.test(value.trim());
}

function parseDanfeItemLine(line: string) {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 8) {
    return null;
  }

  const code = tokens[0]?.trim();
  const ncmIndex = tokens.findIndex((token, index) => index > 0 && isNcmToken(token));
  if (!code || ncmIndex < 2) {
    return null;
  }

  const description = tokens.slice(1, ncmIndex).join(" ").trim();
  const ncm = extractDigits(tokens[ncmIndex]);
  const cst = tokens[ncmIndex + 1]?.trim() ?? "";
  const cfop = tokens[ncmIndex + 2]?.trim() ?? "";
  const unidade = tokens[ncmIndex + 3]?.trim() ?? "";
  const quantidade = tokens[ncmIndex + 4]?.trim() ?? "";
  const valorUnitario = tokens[ncmIndex + 5]?.trim() ?? "";
  const valorTotalItem = tokens[ncmIndex + 6]?.trim() ?? "";

  if (!description || !isCstToken(cst) || !isCfopToken(cfop) || !isUnitToken(unidade) || !isQuantityToken(quantidade) || !isMoneyToken(valorUnitario) || !isMoneyToken(valorTotalItem)) {
    return null;
  }

  return {
    codigo_produto: code,
    descricao: description,
    ncm,
    cst,
    cfop,
    unidade,
    quantidade,
    qtde: quantidade,
    valor_unitario: normalizeMoneyValue(valorUnitario),
    valor_total_item: normalizeMoneyValue(valorTotalItem)
  } satisfies Record<string, unknown>;
}

function parseDanfeItems(lines: string[]) {
  const items: Array<Record<string, unknown>> = [];
  const startIndex = lines.findIndex(line => /cod(?:igo)?\.?\s*prod|cod(?:igo)?\s+produto/i.test(line) && /descricao/i.test(line));
  if (startIndex < 0) {
    return items;
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    if (isDanfeItemsFooter(line)) {
      break;
    }

    const parsed = parseDanfeItemLine(line);
    if (!parsed) {
      continue;
    }

    const continuation: string[] = [];
    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1].trim();
      if (!nextLine || isDanfeItemsFooter(nextLine) || parseDanfeItemLine(nextLine)) {
        break;
      }

      if (/^vlr\s+bc-st|^vlr\s+icms-st/i.test(nextLine)) {
        break;
      }

      continuation.push(nextLine);
      index += 1;
    }

    if (continuation.length > 0) {
      parsed.descricao = cleanupValue(`${parsed.descricao} ${continuation.join(" ")}`);
    }

    items.push(parsed);
  }

  return items;
}

function findFallbackAddress(text: string, companyName: string, cep: string) {
  if (!companyName || !cep) {
    return "";
  }

  const normalized = normalizeText(text);
  const companyIndex = normalized.indexOf(companyName);
  const cepIndex = normalized.indexOf(cep);
  if (companyIndex < 0 || cepIndex <= companyIndex) {
    return "";
  }

  const block = normalized.slice(companyIndex + companyName.length, cepIndex);
  const address = block
    .replace(/\b[A-Z]{2}\s*-\s*CEP:?\s*$/i, "")
    .replace(/^(ROD|RUA|AV|AVENIDA|ESTRADA|TRAVESSA)/i, match => match)
    .trim();

  return cleanupValue(address);
}

function setAliases(fields: Record<string, unknown>, key: string, value: unknown, aliases: string[]) {
  if (value == null || value === "") {
    return;
  }

  fields[key] = value;
  for (const alias of aliases) {
    fields[alias] = value;
  }
}

async function enrichAddressByCep(fields: Record<string, unknown>) {
  const cep = extractDigits(onlyText(fields.emitente_cep ?? fields.cep));
  if (cep.length !== 8) {
    return fields;
  }

  try {
    const response = await fetch(`/api/cep/${cep}`, { cache: "no-store" });
    if (!response.ok) {
      return fields;
    }

    const data = await response.json() as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };

    if (data.erro) {
      return fields;
    }

    if (!onlyText(fields.emitente_endereco) && data.logradouro) {
      setAliases(fields, "emitente_endereco", data.logradouro, ["endereco"]);
    }
    if (!onlyText(fields.emitente_bairro) && data.bairro) {
      setAliases(fields, "emitente_bairro", data.bairro, ["bairro"]);
    }
    if (!onlyText(fields.emitente_municipio) && data.localidade) {
      setAliases(fields, "emitente_municipio", data.localidade, ["municipio"]);
    }
    if (!onlyText(fields.emitente_uf) && data.uf) {
      setAliases(fields, "emitente_uf", data.uf, ["estado"]);
    }
  } catch {
    // CEP enrichment is optional. The parsed PDF data is still useful without it.
  }

  return fields;
}

function parseDanfeText(text: string): DanfeReadResult {
  const fields: Record<string, unknown> = {};
  const normalized = normalizeText(text);
  const lines = splitLines(text);
  const accessKey = findAccessKey(normalized);
  const emitenteName = findEmitenteName(normalized);
  const emitenteCnpj = findEmitenteCnpj(normalized);
  const emitenteIe = findInscricaoEstadual(normalized);
  const cep = findCep(normalized);
  const uf = findUf(normalized);
  const dataEmissao = findEmissionDate(normalized);
  const total = findHighestCurrency(normalized);
  const naturezaOperacao = findNaturezaOperacao(normalized);
  const { numero, serie } = findHeaderFields(normalized, accessKey);

  setAliases(fields, "nfe_chave_acesso", accessKey, ["chaveAcesso"]);
  setAliases(fields, "nfe_numero", numero, ["numeroNfe"]);
  setAliases(fields, "nfe_serie", serie, ["serie"]);
  setAliases(fields, "nfe_natureza_operacao", naturezaOperacao, ["natureza_operacao"]);
  setAliases(fields, "nfe_data_emissao", dataEmissao, ["dataEmissao", "data_emissao"]);
  setAliases(fields, "emitente_razao_social", emitenteName, ["emitente", "razao_social"]);
  setAliases(fields, "emitente_cnpj", emitenteCnpj ? formatCnpj(emitenteCnpj) : "", ["cnpjEmitente", "cnpj"]);
  setAliases(fields, "emitente_inscricao_estadual", emitenteIe, ["inscricao_estadual"]);
  setAliases(fields, "emitente_cep", cep, ["cep"]);
  setAliases(fields, "emitente_uf", uf, ["estado"]);
  setAliases(fields, "total_produtos", total, ["valor_total_dos_produtos"]);
  setAliases(fields, "total_nota", total, ["valorTotal", "valor_total_da_nota"]);

  const fallbackAddress = findFallbackAddress(normalized, emitenteName, cep);
  setAliases(fields, "emitente_endereco", fallbackAddress, ["endereco"]);

  const items = parseDanfeItems(lines);
  if (items.length > 0) {
    fields.itens = items;
    fields.items = items;
    fields.produtos = items;
  }

  return { fields, warnings: [] };
}

async function loadPdfJs() {
  const browserWindow = window as DanfeReaderWindow;

  if (browserWindow.pdfjsLib) {
    return browserWindow.pdfjsLib;
  }

  if (!browserWindow.__pdfJsLoader) {
    browserWindow.__pdfJsLoader = new Promise<PdfJsLib>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-pdfjs="danfe-reader"]');
      if (existingScript) {
        existingScript.addEventListener("load", () => {
          if (!browserWindow.pdfjsLib) {
            reject(new Error("PDF.js nao foi carregado."));
            return;
          }

          browserWindow.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
          resolve(browserWindow.pdfjsLib);
        });
        existingScript.addEventListener("error", () => reject(new Error("Falha ao carregar PDF.js.")));
        return;
      }

      const script = document.createElement("script");
      script.src = PDF_JS_URL;
      script.async = true;
      script.dataset.pdfjs = "danfe-reader";
      script.onload = () => {
        if (!browserWindow.pdfjsLib) {
          reject(new Error("PDF.js nao foi carregado."));
          return;
        }

        browserWindow.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
        resolve(browserWindow.pdfjsLib);
      };
      script.onerror = () => reject(new Error("Falha ao carregar PDF.js."));
      document.head.appendChild(script);
    });
  }

  return browserWindow.__pdfJsLoader;
}

function buildPdfLines(items: Array<{ str?: string; transform?: number[] }>) {
  const tokens = items
    .map(item => ({
      text: (item.str ?? "").trim(),
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0
    }))
    .filter(item => item.text.length > 0)
    .sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 2) {
        return yDiff;
      }

      return a.x - b.x;
    });

  const lines: Array<{ y: number; parts: string[] }> = [];
  for (const token of tokens) {
    const line = lines.find(current => Math.abs(current.y - token.y) <= 2);
    if (line) {
      line.parts.push(token.text);
    } else {
      lines.push({ y: token.y, parts: [token.text] });
    }
  }

  return lines.map(line => line.parts.join(" "));
}

async function extractPdfTextInBrowser(file: File) {
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(buildPdfLines(content.items).join("\n"));
  }

  return pages.join("\n");
}

export async function readDanfeInBrowser(file: File): Promise<DanfeReadResult> {
  const text = await extractPdfTextInBrowser(file);
  const result = parseDanfeText(text);
  const fields = await enrichAddressByCep(result.fields);

  return { ...result, fields };
}
