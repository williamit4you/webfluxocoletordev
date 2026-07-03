"use client";

import { api } from "@/lib/api";
import { readDanfeInBrowser as readDanfeFileInBrowser } from "@/lib/danfeReader";
import type { ExecutionField, FieldOption, Flow, Instance, StepApiConfig } from "@/lib/types";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronUp, Clock, Paperclip, Play, RotateCw, Save, ShieldAlert, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    pdfjsLib?: {
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
    __pdfJsLoader?: Promise<NonNullable<Window["pdfjsLib"]>>;
  }
}

type UploadAsset = {
  id: string;
  fieldKey: string;
  fileName: string;
  contentType: string;
  size: number;
  url: string;
  isPhoto: boolean;
  uploadedAt: string;
};

type ReaderParseResult = {
  fields: Record<string, unknown>;
  warnings: string[];
};

type ExecutionGateState = {
  title: string;
  message: string;
  accent: "danger" | "success";
};

const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_JS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function isUploadField(type: number) {
  return type === 3 || type === 7;
}

function toText(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeReaderToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const readerAliasGroups: ReadonlyArray<ReadonlyArray<string>> = [
  ["chaveacesso", "chave", "chavenfe", "chavedeacesso", "accesskey", "nfechaveacesso"],
  ["numeronfe", "numerodanota", "numerodocumento", "numero", "nfe", "nfenumero"],
  ["serie", "nfeserie"],
  ["emitente", "razaosocial", "razaosocialemitente", "fornecedor", "nomeemitente", "emitenterazaosocial", "razaosocialdoemitente"],
  ["cnpj", "cnpjemitente", "documentoemitente", "cpfcnpj", "cpfcnpjemitente", "emitentecnpj", "cnpjdoemitente"],
  ["inscricaoestadual", "ie", "ieemitente", "inscestadual", "emitenteinscricaoestadual", "inscricaoestadualdoemitente"],
  ["dataemissao", "emissao", "data", "nfedataemissao", "datadeemissao"],
  ["endereco", "logradouro", "rua", "enderecocompleto", "emitenteendereco", "enderecodoemitente"],
  ["bairro", "emitentebairro", "bairrodoemitente"],
  ["cep", "emitentecep", "cepdoemitente"],
  ["municipio", "cidade", "localidade", "emitentemunicipio", "municipiodoemitente"],
  ["estado", "uf", "emitenteuf", "ufdoemitente"],
  ["telefone", "fone", "celular", "contato", "emitentetelefone", "telefonedoemitente"],
  ["valortotal", "valortotaldanota", "totalnota", "valornota", "totalnotafiscal"],
  ["valortotaldosprodutos", "totalprodutos", "valorprodutos"],
  ["itens", "produtos"]
];

function expandReaderAliases(value: string) {
  const normalized = normalizeReaderToken(value);
  const aliases = new Set<string>([normalized]);

  for (const group of readerAliasGroups) {
    if (group.includes(normalized)) {
      for (const alias of group) {
        aliases.add(alias);
      }
    }
  }

  return aliases;
}

function parseReaderDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const brDate = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDate) {
    return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
  }

  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }

  return trimmed;
}

function parseReaderNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : trimmed;
}

function coerceReaderValue(field: ExecutionField, value: unknown) {
  const text = toText(value).trim();
  if (!text) {
    return "";
  }

  if (field.type === 2) {
    return parseReaderDate(text);
  }

  if (field.type === 1) {
    return parseReaderNumber(text);
  }

  return field.mask ? applyMask(field.mask, text) : text;
}

function buildReaderCandidates(field: ExecutionField) {
  const candidates = new Set<string>();

  for (const source of [field.key, field.label]) {
    for (const alias of expandReaderAliases(source)) {
      candidates.add(alias);
    }
  }

  return candidates;
}

function normalizeReaderText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractDigits(value: string) {
  return value.replace(/\D+/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRegexValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return "";
}

function extractHighestCurrency(text: string) {
  const values = Array.from(text.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g))
    .map(match => match[0])
    .map(raw => ({ raw, value: Number(raw.replace(/\./g, "").replace(",", ".")) }))
    .filter(item => !Number.isNaN(item.value));

  if (values.length === 0) {
    return "";
  }

  return values.sort((left, right) => right.value - left.value)[0].raw;
}

function extractEmitenteInscricaoEstadual(text: string, cnpj: string) {
  const cnpjIndex = text.indexOf(cnpj);
  if (cnpjIndex < 0) {
    return "";
  }

  const windowStart = Math.max(0, cnpjIndex - 32);
  const beforeCnpj = extractDigits(text.slice(windowStart, cnpjIndex));
  if (beforeCnpj.length < 12) {
    return "";
  }

  return beforeCnpj.slice(-12);
}

function splitEmitenteAddressBlock(addressBlock: string, municipio?: string) {
  const cleaned = addressBlock.trim();
  if (!cleaned) {
    return { endereco: "", bairro: "", municipio: municipio?.trim() ?? "" };
  }

  let working = cleaned;
  let resolvedMunicipio = municipio?.trim() ?? "";
  const stateMatch = working.match(/\s*-\s*([A-Z]{2})\s*$/);
  if (stateMatch) {
    working = working.slice(0, stateMatch.index).trim();
  }

  if (resolvedMunicipio) {
    const normalizedWorking = normalizeReaderToken(working);
    const normalizedMunicipio = normalizeReaderToken(resolvedMunicipio);
    if (normalizedMunicipio && normalizedWorking.endsWith(normalizedMunicipio)) {
      working = working.slice(0, Math.max(0, working.length - resolvedMunicipio.length)).trim();
    }
  }

  const lastSeparator = working.lastIndexOf(" - ");
  if (lastSeparator < 0) {
    return { endereco: working, bairro: "", municipio: resolvedMunicipio };
  }

  return {
    endereco: working.slice(0, lastSeparator).trim(),
    bairro: working.slice(lastSeparator + 3).trim(),
    municipio: resolvedMunicipio
  };
}

function findLineValue(lines: string[], labelPatterns: RegExp[], fallbackPatterns: RegExp[] = []) {
  for (const pattern of fallbackPatterns) {
    const direct = findRegexValue(lines.join("\n"), [pattern]);
    if (direct) {
      return direct;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!labelPatterns.some(pattern => pattern.test(line))) {
      continue;
    }

    const sameLine = line
      .replace(/^[^:]*:\s*/u, "")
      .replace(/^(?:nome|razao|social|endereco|bairro|cep|municipio|uf|fone|fax|telefone|inscricao estadual)\s*/iu, "")
      .trim();

    if (sameLine && sameLine !== line.trim()) {
      return sameLine;
    }

    for (let offset = 1; offset <= 2; offset += 1) {
      const candidate = lines[index + offset]?.trim();
      if (!candidate) {
        continue;
      }

      if (candidate.endsWith(":")) {
        continue;
      }

      return candidate;
    }
  }

  return "";
}

function parseDanfeItems(lines: string[]) {
  const items: Array<Record<string, unknown>> = [];
  const startIndex = lines.findIndex(line => /codigo\s+produto|cod(?:igo)?\s+prod/i.test(line) && /descricao/i.test(line));
  if (startIndex < 0) {
    return items;
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    if (/dados adicionais|calculo do imposto|transportador|cobranca/i.test(line)) {
      break;
    }

    const match = line.match(/^(\S+)\s+(.+?)\s+(\d{4}\.?\d{2}\.?\d{2}|\d{8})\s+([0-9]{2,3})\s+([0-9]{4})\s+([0-9.,]+)\s+([0-9.,]+)\s+([0-9.,]+)$/);
    if (!match) {
      continue;
    }

    items.push({
      codigo_produto: match[1].trim(),
      descricao: match[2].trim(),
      ncm: match[3].trim(),
      cst: match[4].trim(),
      cfop: match[5].trim(),
      qtde: match[6].trim(),
      valor_unitario: match[7].trim(),
      valor_total_item: match[8].trim()
    });
  }

  return items;
}

async function enrichReaderData(fields: Record<string, unknown>) {
  const next = { ...fields };
  const cep = extractDigits(toText(fields.cep));
  const addressBlock = toText(fields._emitente_address_block);

  if (addressBlock && !toText(next.endereco)) {
    next.endereco = addressBlock;
  }

  if (cep.length === 8) {
    try {
      const response = await fetch(`/api/cep/${cep}`);
      if (response.ok) {
        const data = await response.json() as {
          cep?: string;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
          erro?: boolean;
        };

        if (!data.erro) {
          if (data.cep) {
            next.cep = data.cep;
          }

          if (data.logradouro) {
            next.endereco = data.logradouro;
          }

          if (data.bairro) {
            next.bairro = data.bairro;
          }

          if (data.localidade) {
            next.municipio = data.localidade;
          }

          if (data.uf) {
            next.estado = data.uf;
          }

          if (addressBlock) {
            const parts = splitEmitenteAddressBlock(addressBlock, data.localidade);
            if (parts.endereco) {
              next.endereco = parts.endereco;
            }

            if (parts.bairro) {
              next.bairro = parts.bairro;
            }

            if (parts.municipio) {
              next.municipio = parts.municipio;
            }
          }
        }
      }
    } catch {
      // Keep the extracted values when the CEP lookup is unavailable.
    }
  }

  if (addressBlock && (!toText(next.endereco) || !toText(next.bairro) || !toText(next.municipio))) {
    const parts = splitEmitenteAddressBlock(addressBlock, toText(next.municipio));
    if (parts.endereco && (!toText(next.endereco) || toText(next.endereco) === addressBlock)) {
      next.endereco = parts.endereco;
    }

    if (parts.bairro && !toText(next.bairro)) {
      next.bairro = parts.bairro;
    }

    if (parts.municipio && !toText(next.municipio)) {
      next.municipio = parts.municipio;
    }
  }

  delete next._emitente_address_block;

  return next;
}

function parseDanfeText(text: string) {
  const compactText = text.replace(/\s+/g, " ").trim();
  const lines = text
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const fields: Record<string, unknown> = {};

  const emitente = findRegexValue(compactText, [
    /RECEBEMOS DE (.+?) OS PRODUTOS CONSTANTES DA NOTA FISCAL/i
  ]);
  if (emitente) {
    fields.razao_social = emitente;
    fields.emitente = emitente;
  }

  const cnpj = findRegexValue(compactText, [
    /\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/
  ]);
  if (cnpj) {
    fields.cnpj = cnpj;
    fields.cnpjEmitente = cnpj;
  }

  const inscricaoEstadual = cnpj ? extractEmitenteInscricaoEstadual(compactText, cnpj) : "";
  if (inscricaoEstadual) {
    fields.inscricao_estadual = inscricaoEstadual;
    fields.inscricaoEstadual = inscricaoEstadual;
  }

  const emitenteBlockMatch = emitente
    ? compactText.match(new RegExp(`${escapeRegExp(emitente)}\\s+(.+?)\\s+([A-ZÃƒâ‚¬-ÃƒÅ¡\\s]+?)\\s+-\\s+([A-Z]{2})\\s+-\\s+CEP:\\s*([0-9]{8})\\s+([0-9]{2}\\/[0-9]{2}\\/[0-9]{4})`, "i"))
    : null;

  const emitenteBlock = emitenteBlockMatch ?? (emitente
    ? compactText.match(new RegExp(
      `${escapeRegExp(emitente)}\\s+(.+?)\\s+([A-ZÃƒÆ’Ã¢â€šÂ¬-ÃƒÆ’Ã…Â¡\\s]+?)\\s*-\\s*([A-Z]{2})\\s*-\\s*CEP:\\s*([0-9]{8})\\s*([0-9]{2}\\/[0-9]{2}\\/[0-9]{4})`,
      "i"
    ))
    : null);

  const rawAddressBlock = emitenteBlock?.[1]?.trim() ?? "";
  const lastHyphenIndex = rawAddressBlock.lastIndexOf(" - ");
  const endereco = lastHyphenIndex > 0
    ? rawAddressBlock.slice(0, lastHyphenIndex).trim()
    : rawAddressBlock;
  if (endereco) {
    fields.endereco = endereco;
  }

  const bairro = lastHyphenIndex > 0
    ? rawAddressBlock.slice(lastHyphenIndex + 3).trim()
    : "";
  if (bairro) {
    fields.bairro = bairro;
  }

  const cep = emitenteBlock?.[4]?.trim() ?? findRegexValue(compactText, [
    /CEP[:\s]*([0-9]{5}-?[0-9]{3})/i
  ]);
  if (cep) {
    fields.cep = cep;
  }

  const municipio = emitenteBlock?.[2]?.trim() ?? "";
  if (municipio) {
    fields.municipio = municipio;
  }

  const telefone = findRegexValue(compactText, [
    /(?:FONE|FONE\/FAX|TELEFONE)[:\s]*([\d()\s-]{8,})/i
  ]);
  if (telefone) {
    fields.telefone = telefone;
  }

  const estado = emitenteBlock?.[3]?.trim() ?? findRegexValue(compactText, [
    /([A-Z]{2})\s*-\s*CEP:\s*[0-9]{8}/i,
    /\bUF[:\s]*([A-Z]{2})\b/i
  ]);
  if (estado) {
    fields.estado = estado;
  }

  const dataEmissao = emitenteBlock?.[5]?.trim() ?? findRegexValue(compactText, [
    /DATA (?:DE )?EMISSAO[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
  ]);
  if (dataEmissao) {
    fields.data_emissao = dataEmissao;
    fields.dataEmissao = dataEmissao;
  }

  const simplifiedEmitenteCepBlock = emitente
    ? compactText.match(new RegExp(`${escapeRegExp(emitente)}\\s+(.+?)\\s*-\\s*CEP:\\s*([0-9]{8})\\s*([0-9]{2}\\/[0-9]{2}\\/[0-9]{4})`, "i"))
    : null;
  if (simplifiedEmitenteCepBlock) {
    fields._emitente_address_block = simplifiedEmitenteCepBlock[1].trim();
    fields.cep = simplifiedEmitenteCepBlock[2].trim();
    fields.data_emissao = simplifiedEmitenteCepBlock[3].trim();
    fields.dataEmissao = simplifiedEmitenteCepBlock[3].trim();

    const simplifiedState = findRegexValue(simplifiedEmitenteCepBlock[1], [
      /([A-Z]{2})\s*$/i
    ]);
    if (simplifiedState) {
      fields.estado = simplifiedState;
    }
  }

  const valorProdutos = findRegexValue(compactText, [
    /([0-9.]+,[0-9]{2})\s*VALOR TOTAL DOS PRODUTOS/i,
    /VALOR TOTAL DOS PRODUTOS[:\s]*([0-9.]+,[0-9]{2})/i
  ]);
  const normalizedValorProdutos = valorProdutos && valorProdutos !== "0,00"
    ? valorProdutos
    : extractHighestCurrency(compactText);
  if (normalizedValorProdutos) {
    fields.valor_total_dos_produtos = normalizedValorProdutos;
  }

  const valorNota = findRegexValue(compactText, [
    /([0-9.]+,[0-9]{2})\s*VALOR TOTAL DA NOTA/i,
    /VALOR TOTAL DA NOTA[:\s]*([0-9.]+,[0-9]{2})/i,
    /VALOR TOTAL[:\s]*([0-9.]+,[0-9]{2})/i
  ]);
  const normalizedValorNota = valorNota && valorNota !== "0,00"
    ? valorNota
    : extractHighestCurrency(compactText);
  if (normalizedValorNota) {
    fields.valor_total_da_nota = normalizedValorNota;
    fields.valorTotal = normalizedValorNota;
    if (!fields.valor_total_dos_produtos) {
      fields.valor_total_dos_produtos = normalizedValorNota;
    }
  }

  const chaveAcesso = extractDigits(findRegexValue(compactText, [
    /CHAVE DE ACESSO[:\s]*((?:\d[\s.-]*){44})/i
  ]));
  if (chaveAcesso.length === 44) {
    fields.chaveAcesso = chaveAcesso;
  }

  const numeroNfe = findRegexValue(compactText, [
    /N[ÃƒÅ¡U]MERO[:\s]*([0-9]{1,9})/i,
    /NF-E\s+N[OÃ‚ÂºÃ‚Â°]?\s*([0-9]{1,9})/i
  ]);
  if (numeroNfe) {
    fields.numeroNfe = numeroNfe;
  }

  const serie = findRegexValue(compactText, [
    /S[Ãƒâ€°E]RIE[:\s]*([0-9]{1,3})/i
  ]);
  if (serie) {
    fields.serie = serie;
  }

  const items = parseDanfeItems(lines);
  if (items.length > 0) {
    fields.itens = items;
    fields.items = items;
  }

  const warnings: string[] = [];
  if (Object.keys(fields).length === 0) {
    warnings.push("Não foi possível identificar dados da nota no navegador. Confirme se o PDF possui texto selecionável.");
  }

  return { fields, warnings };
}

async function loadPdfJs() {
  if (window.pdfjsLib) {
    return window.pdfjsLib;
  }

  if (!window.__pdfJsLoader) {
    window.__pdfJsLoader = new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-pdfjs="reader"]');
      if (existingScript) {
        existingScript.addEventListener("load", () => {
          if (!window.pdfjsLib) {
            reject(new Error("Biblioteca de leitura de PDF não ficou disponível."));
            return;
          }

          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
          resolve(window.pdfjsLib);
        }, { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Falha ao carregar a biblioteca de PDF.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = PDF_JS_URL;
      script.async = true;
      script.dataset.pdfjs = "reader";
      script.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error("Biblioteca de leitura de PDF não ficou disponível."));
          return;
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error("Falha ao carregar a biblioteca de PDF."));
      document.head.appendChild(script);
    });
  }

  return window.__pdfJsLoader;
}

function buildPdfLines(items: Array<{ str?: string; transform?: number[] }>) {
  const positioned = items
    .map(item => ({
      text: item.str?.trim() ?? "",
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0
    }))
    .filter(item => item.text);

  positioned.sort((left, right) => {
    if (Math.abs(right.y - left.y) > 2) {
      return right.y - left.y;
    }

    return left.x - right.x;
  });

  const groups: Array<{ y: number; entries: Array<{ text: string; x: number }> }> = [];
  for (const item of positioned) {
    const currentGroup = groups[groups.length - 1];
    if (!currentGroup || Math.abs(currentGroup.y - item.y) > 2.5) {
      groups.push({ y: item.y, entries: [{ text: item.text, x: item.x }] });
      continue;
    }

    currentGroup.entries.push({ text: item.text, x: item.x });
  }

  return groups.map(group =>
    group.entries
      .sort((left, right) => left.x - right.x)
      .map(entry => entry.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
  ).filter(Boolean);
}

async function extractPdfTextInBrowser(file: File) {
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = buildPdfLines(content.items);
    pageTexts.push(lines.join("\n"));
  }

  return pageTexts.join("\n\n");
}

async function readDanfeInBrowser(file: File): Promise<ReaderParseResult> {
  const text = await extractPdfTextInBrowser(file);
  return parseDanfeText(text);
}

function formatPreviewContent(value: unknown) {
  if (value && typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  const text = toText(value).trim();
  if (!text) {
    return "-";
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function PreviewBlock({ title, value }: { title?: string; value: unknown }) {
  const formatted = useMemo(() => formatPreviewContent(value), [value]);
  const lines = formatted.split(/\r?\n/).length;
  const isLarge = formatted.length > 320 || lines > 8;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="preview-block">
      {title && <div className="section-copy preview-block-title">{title}</div>}
      <div className={`preview-shell ${expanded ? "expanded" : ""}`}>
        <pre className={`preview-content ${expanded ? "expanded" : "collapsed"}`}>{formatted}</pre>
      </div>
      {isLarge && (
        <button className="btn btn-ghost btn-inline preview-toggle" type="button" onClick={() => setExpanded(current => !current)}>
          {expanded ? "Recolher conteúdo" : "Expandir conteúdo"}
        </button>
      )}
    </div>
  );
}

function getAutomaticStepTechnicalData(step: Instance["steps"][number]) {
  return Object.entries(step.data).filter(([key]) => key.startsWith("_integration."));
}

function tryParseIntervalMinutes(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  const direct = Number(trimmed);
  if (!Number.isNaN(direct) && direct > 0) {
    return direct;
  }

  const match = trimmed.match(/^(\d+)\s*(min|mins|minuto|minutos|h|hr|hora|horas)?$/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? "min").toLowerCase();
  return unit === "h" || unit === "hr" || unit === "hora" || unit === "horas"
    ? amount * 60
    : amount;
}

function parseCronPart(part: string, min: number, max: number) {
  if (part === "*") {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }

  const values = new Set<number>();

  for (const segment of part.split(",")) {
    const item = segment.trim();
    if (!item) {
      continue;
    }

    if (item.includes("/")) {
      const [base, stepRaw] = item.split("/");
      const step = Number(stepRaw);
      if (Number.isNaN(step) || step <= 0) {
        continue;
      }

      const start = base === "*" || !base ? min : Number(base);
      const safeStart = Number.isNaN(start) ? min : Math.max(min, Math.min(max, start));
      for (let current = safeStart; current <= max; current += step) {
        values.add(current);
      }
      continue;
    }

    if (item.includes("-")) {
      const [startRaw, endRaw] = item.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        continue;
      }

      for (let current = Math.max(min, start); current <= Math.min(max, end); current += 1) {
        values.add(current);
      }
      continue;
    }

    const value = Number(item);
    if (!Number.isNaN(value) && value >= min && value <= max) {
      values.add(value);
    }
  }

  return [...values].sort((left, right) => left - right);
}

function getNextCronOccurrence(expression?: string, fromDate = new Date()) {
  if (!expression?.trim()) {
    return null;
  }

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts;
  const minutes = parseCronPart(minutePart, 0, 59);
  const hours = parseCronPart(hourPart, 0, 23);
  const days = parseCronPart(dayPart, 1, 31);
  const months = parseCronPart(monthPart, 1, 12);
  const weekdays = parseCronPart(weekdayPart, 0, 6);

  if (!minutes.length || !hours.length || !days.length || !months.length || !weekdays.length) {
    return null;
  }

  const cursor = new Date(fromDate);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let iteration = 0; iteration < 60 * 24 * 90; iteration += 1) {
    if (
      months.includes(cursor.getMonth() + 1)
      && days.includes(cursor.getDate())
      && weekdays.includes(cursor.getDay())
      && hours.includes(cursor.getHours())
      && minutes.includes(cursor.getMinutes())
    ) {
      return new Date(cursor);
    }

    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

function formatScheduleDate(date: Date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function describeAutomaticSchedule(
  config: StepApiConfig | null | undefined,
  step: Instance["steps"][number]
) {
  const scheduleMode = config?.scheduleMode?.trim().toLowerCase();
  const scheduleValue = config?.scheduleValue?.trim();

  if (!scheduleMode || scheduleMode === "manual") {
    return null;
  }

  if (scheduleMode === "interval") {
    const intervalMinutes = tryParseIntervalMinutes(scheduleValue);
    if (!intervalMinutes) {
      return {
        label: "Agendamento em intervalo",
        detail: scheduleValue || "Intervalo não informado",
        nextAt: null as Date | null
      };
    }

    const latestAttempt = step.integrationAttempts[0]?.createdAt;
    const baseDate = latestAttempt
      ? new Date(latestAttempt)
      : step.startedAt
        ? new Date(step.startedAt)
        : new Date();
    const nextAt = new Date(baseDate.getTime() + intervalMinutes * 60 * 1000);

    return {
      label: "Agendamento em intervalo",
      detail: `A cada ${intervalMinutes} minuto(s)`,
      nextAt
    };
  }

  if (scheduleMode === "cron") {
    const nextAt = getNextCronOccurrence(scheduleValue);
    return {
      label: "Agendamento cron",
      detail: scheduleValue || "Expressão cron não informada",
      nextAt
    };
  }

  return null;
}

function formatTechnicalDataLabel(key: string) {
  switch (key) {
    case "_integration.success":
      return "Sucesso";
    case "_integration.method":
      return "Metodo";
    case "_integration.url":
      return "URL";
    case "_integration.durationMs":
      return "Duração (ms)";
    case "_integration.executedAtUtc":
      return "Executado em";
    case "_integration.statusCode":
      return "Status HTTP";
    case "_integration.requestHeaders":
      return "Headers enviados";
    case "_integration.requestBody":
      return "Body enviado";
    case "_integration.responsePreview":
      return "Resposta";
    case "_integration.errorMessage":
      return "Erro";
    case "_integration.awaitingData":
      return "Aguardando retorno com conteúdo";
    case "_integration.awaitingDataMessage":
      return "Status da consulta";
    case "_integration.emptyResultRetryMinutes":
      return "Nova consulta a cada (min)";
    case "_integration.responseRule.status":
      return "Regra de retorno";
    case "_integration.responseRule.reason":
      return "Motivo da regra";
    case "_integration.responseRule.targetPath":
      return "Caminho avaliado";
    case "_integration.responseRule.expectedType":
      return "Tipo esperado";
    case "_integration.responseRule.mode":
      return "Tipo de regra";
    case "_integration.responseRule.operator":
      return "Operador";
    case "_integration.responseRule.actualValue":
      return "Valor atual";
    case "_integration.responseRule.expectedValue":
      return "Valor esperado";
    case "_integration.responseRule.matched":
      return "Condicao atendida";
    case "_integration.responseRule.retryIntervalMinutes":
      return "Nova tentativa a cada (min)";
    case "_integration.responseRule.attemptCount":
      return "Tentativa atual";
    case "_integration.responseRule.maxAttempts":
      return "Limite de tentativas";
    case "_integration.responseRule.nextAttemptAtUtc":
      return "Próxima tentativa";
    case "_integration.mappingWarning":
      return "Aviso do mapeamento";
    case "_integration.mappingResult":
      return "Resultado do mapeamento";
    default:
      return key.replace("_integration.", "");
  }
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, "");
}

function formatCurrency(value: string) {
  const digits = digitsOnly(value);
  if (!digits) {
    return "";
  }

  const amount = Number(digits) / 100;
  return amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function applyMask(mask: string | null | undefined, value: string) {
  if (!mask) {
    return value;
  }

  const normalized = value ?? "";
  const digits = digitsOnly(normalized);

  switch (mask) {
    case "cep":
      return digits.replace(/^(\d{0,5})(\d{0,3}).*$/, (_, a, b) => b ? `${a}-${b}` : a);
    case "cpf":
      return digits
        .replace(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2}).*$/, (_, a, b, c, d) =>
          [a, b && `.${b}`, c && `.${c}`, d && `-${d}`].filter(Boolean).join(""));
    case "cnpj":
      return digits
        .replace(/^(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2}).*$/, (_, a, b, c, d, e) =>
          [a, b && `.${b}`, c && `.${c}`, d && `/${d}`, e && `-${e}`].filter(Boolean).join(""));
    case "telefone":
    case "celular": {
      const limited = digits.slice(0, mask === "celular" ? 11 : 11);
      if (limited.startsWith("0")) {
        return limited.replace(/^(\d{0,3})(\d{0,5})(\d{0,4}).*$/, (_, a, b, c) =>
          [a && `(${a})`, b && ` ${b}`, c && `-${c}`].filter(Boolean).join(""));
      }

      if (mask === "celular") {
        return limited.replace(/^(\d{0,2})(\d{0,5})(\d{0,4}).*$/, (_, a, b, c) =>
          [a && `(${a})`, b && ` ${b}`, c && `-${c}`].filter(Boolean).join(""));
      }

      return limited.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*$/, (_, a, b, c) =>
        [a && `(${a})`, b && ` ${b}`, c && `-${c}`].filter(Boolean).join(""));
    }
    case "valor":
      return formatCurrency(normalized);
    case "data":
      return digits.replace(/^(\d{0,2})(\d{0,2})(\d{0,4}).*$/, (_, a, b, c) =>
        [a, b && `/${b}`, c && `/${c}`].filter(Boolean).join(""));
    default:
      return normalized;
  }
}

function resolveInputType(fieldType: number, mask?: string | null) {
  if (mask) {
    return "text";
  }

  return fieldType === 1 ? "number" : fieldType === 2 ? "date" : fieldType === 4 ? "email" : "text";
}

function isStructuredListField(field: ExecutionField) {
  return field.type === 5 && field.options.some(option => option.key?.trim() && option.type !== undefined && option.type !== null);
}

function parseStructuredRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<Record<string, unknown>>;
  }

  return value
    .map(item => item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : null)
    .filter((item): item is Record<string, unknown> => !!item);
}

function rowHasContent(row: Record<string, unknown>, field: ExecutionField) {
  return field.options.some(option => {
    const key = option.key?.trim();
    return key ? toText(row[key]).trim() : false;
  });
}

function sanitizeStructuredListValue(field: ExecutionField, value: unknown) {
  const rows = parseStructuredRows(value);

  return rows
    .map(row => Object.fromEntries(
      field.options
        .map(option => option.key?.trim())
        .filter((key): key is string => !!key)
        .map(key => [key, toText(row[key]).trim()])
    ))
    .filter(row => rowHasContent(row, field));
}

function mapStructuredReaderRows(field: ExecutionField, value: unknown) {
  const rows = parseStructuredRows(value);
  if (rows.length === 0) {
    return [] as Array<Record<string, unknown>>;
  }

  return rows
    .map(row => {
      const mappedRow = Object.fromEntries(
        field.options
          .map(option => option.key?.trim())
          .filter((key): key is string => !!key)
          .map(optionKey => {
            const candidates = expandReaderAliases(optionKey);
            const match = Object.entries(row).find(([rowKey]) => {
              const aliases = expandReaderAliases(rowKey);
              return [...aliases].some(alias => candidates.has(alias));
            });

            return [optionKey, match?.[1] ?? ""];
          })
      );

      return mappedRow;
    })
    .filter(row => rowHasContent(row, field));
}

function sanitizeStepPayload(currentStep: Instance["steps"][number] | undefined, formData: Record<string, unknown>) {
  if (!currentStep) {
    return formData;
  }

  return Object.fromEntries(currentStep.fields.map(field => [
    field.key,
    isStructuredListField(field)
      ? sanitizeStructuredListValue(field, formData[field.key])
      : formData[field.key]
  ]));
}

type RequiredFieldIssue = {
  fieldKey: string;
  message: string;
};

function getRequiredFieldIssues(currentStep: Instance["steps"][number] | undefined, formData: Record<string, unknown>) {
  if (!currentStep) {
    return [] as RequiredFieldIssue[];
  }

  const payload = sanitizeStepPayload(currentStep, formData);
  const issues: RequiredFieldIssue[] = [];

  for (const field of currentStep.fields) {
    if (!field.required) {
      continue;
    }

    const value = payload[field.key];
    if (value == null) {
      issues.push({ fieldKey: field.key, message: field.label });
      continue;
    }

    if (isUploadField(field.type)) {
      if (parseUploadAssets(value).length === 0) {
        issues.push({ fieldKey: field.key, message: field.label });
      }
      continue;
    }

    if (isStructuredListField(field)) {
      const rows = sanitizeStructuredListValue(field, value);
      const hasAnyRow = rows.some(row => Object.values(row).some(cell => toText(cell).trim()));
      if (!hasAnyRow) {
        issues.push({ fieldKey: field.key, message: field.label });
        continue;
      }

      for (const [rowIndex, row] of rows.entries()) {
        for (const option of field.options) {
          const key = option.key?.trim();
          if (!option.required || !key) {
            continue;
          }

          if (!toText(row[key]).trim()) {
            issues.push({ fieldKey: field.key, message: `${field.label}: item ${rowIndex + 1} - ${option.label}` });
          }
        }
      }
      continue;
    }

    if (!toText(value).trim()) {
      issues.push({ fieldKey: field.key, message: field.label });
    }
  }

  return issues;
}

function buildReaderCode(currentStep: Instance["steps"][number] | undefined, formData: Record<string, unknown>) {
  if (!currentStep) {
    return "";
  }

  for (const key of ["chaveAcesso", "numeroNfe", "codigo", "code"]) {
    const value = toText(formData[key]).trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function parseUploadAssets(value: unknown): UploadAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : typeof row.Id === "string" ? String(row.Id) : "";
      const fieldKey = typeof row.fieldKey === "string" ? row.fieldKey : typeof row.FieldKey === "string" ? String(row.FieldKey) : "";
      const fileName = typeof row.fileName === "string" ? row.fileName : typeof row.FileName === "string" ? String(row.FileName) : "";
      const contentType = typeof row.contentType === "string" ? row.contentType : typeof row.ContentType === "string" ? String(row.ContentType) : "application/octet-stream";
      const size = typeof row.size === "number" ? row.size : typeof row.Size === "number" ? row.Size : 0;
      const url = typeof row.url === "string" ? row.url : typeof row.Url === "string" ? String(row.Url) : "";
      const isPhoto = typeof row.isPhoto === "boolean" ? row.isPhoto : typeof row.IsPhoto === "boolean" ? row.IsPhoto : false;
      const uploadedAt = typeof row.uploadedAt === "string" ? row.uploadedAt : typeof row.UploadedAt === "string" ? String(row.UploadedAt) : "";

      if (!id || !fileName || !url) {
        return null;
      }

      return { id, fieldKey, fileName, contentType, size, url, isPhoto, uploadedAt };
    })
    .filter((item): item is UploadAsset => !!item);
}

function buildAssetUrl(url: string) {
  if (!url) {
    return "#";
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `/api/proxy${url.startsWith("/") ? url : `/${url}`}`;
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function buildCurrentStepFormData(result: Instance) {
  const currentStep = result.steps.find(step => step.id === result.currentStepExecutionId) ?? result.steps.find(step => step.status === 1);
  if (!currentStep) {
    return { currentStep: undefined, formData: {} as Record<string, unknown> };
  }

  const formData = currentStep.fields.reduce<Record<string, unknown>>((accumulator, field) => {
    accumulator[field.key] = currentStep.data[field.key] ?? field.value ?? (isUploadField(field.type) ? [] : isStructuredListField(field) ? [] : "");
    return accumulator;
  }, {});

  return { currentStep, formData };
}

function syncCurrentStepState(result: Instance, setItem: (value: Instance) => void, setFormData: (value: Record<string, unknown>) => void, setNotes: (value: string) => void) {
  setItem(result);
  const { currentStep, formData } = buildCurrentStepFormData(result);
  if (!currentStep) {
    setFormData({});
    setNotes("");
    return;
  }

  setFormData(formData);
  setNotes(currentStep.notes ?? "");
}

function renderUploadField(
  field: ExecutionField,
  value: unknown,
  onUpload: (fieldKey: string, file?: File | null) => Promise<void>,
  uploading: boolean
) {
  const assets = parseUploadAssets(value);
  const isPhoto = field.type === 7;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="btn btn-secondary">
          {isPhoto ? <Camera size={16} /> : <Paperclip size={16} />}
          {isPhoto ? "Enviar foto" : "Enviar anexo"}
          <input
            hidden
            type="file"
            accept={isPhoto ? "image/*" : undefined}
            capture={isPhoto ? "environment" : undefined}
            onChange={event => void onUpload(field.key, event.target.files?.[0])}
          />
        </label>

        {isPhoto && (
          <label className="btn btn-ghost">
            <Camera size={16} />
            Tirar foto agora
            <input
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={event => void onUpload(field.key, event.target.files?.[0])}
            />
          </label>
        )}
      </div>

      {uploading && <div className="notice">Enviando arquivo...</div>}

      {assets.length > 0 ? (
        <div className="data-list">
          {assets.map(asset => (
            <div className="data-item" key={asset.id}>
              <small>{asset.isPhoto ? "Foto" : "Anexo"} | {formatBytes(asset.size)}</small>
              <strong>{asset.fileName}</strong>
              <div className="section-copy" style={{ marginTop: 4 }}>
                <a href={buildAssetUrl(asset.url)} target="_blank" rel="noreferrer">{asset.isPhoto ? "Abrir foto" : "Abrir anexo"}</a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="section-copy">Nenhum arquivo enviado ainda.</div>
      )}
    </div>
  );
}

function renderStructuredCellInput(option: FieldOption, value: unknown, inputName: string, onChange: (next: unknown) => void) {
  const fieldType = option.type ?? 0;

  if (fieldType === 6) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label className="toggle-line compact">
          <input type="radio" name={inputName} checked={toText(value) === "true"} onChange={() => onChange("true")} />
          Sim
        </label>
        <label className="toggle-line compact">
          <input type="radio" name={inputName} checked={toText(value) === "false"} onChange={() => onChange("false")} />
          Nao
        </label>
      </div>
    );
  }

  const inputType = resolveInputType(fieldType, option.mask);
  return <input className="input" type={inputType} value={toText(value)} onChange={event => onChange(applyMask(option.mask, event.target.value))} />;
}

function renderStructuredListField(
  field: ExecutionField,
  value: unknown,
  onChange: (next: unknown) => void
) {
  const rows = parseStructuredRows(value);

  function addRow() {
    const nextRow = Object.fromEntries(
      field.options
        .map(option => option.key?.trim())
        .filter((key): key is string => !!key)
        .map(key => [key, ""])
    );

    onChange([...rows, nextRow]);
  }

  function updateRow(rowIndex: number, key: string, nextValue: unknown) {
    onChange(rows.map((row, currentIndex) => currentIndex === rowIndex ? { ...row, [key]: nextValue } : row));
  }

  function removeRow(rowIndex: number) {
    onChange(rows.filter((_, currentIndex) => currentIndex !== rowIndex));
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.length === 0 && <div className="section-copy">Nenhum item adicionado.</div>}

      {rows.length > 0 && (
        <div className="tablewrap" style={{ border: "1px solid var(--line)", borderRadius: 16 }}>
          <table className="table">
            <thead>
              <tr>
                {field.options.map(option => {
                  const key = option.key?.trim();
                  if (!key || option.type === undefined || option.type === null) {
                    return null;
                  }

                  return <th key={`${field.key}-header-${key}`}>{option.label}{option.required ? " *" : ""}</th>;
                })}
                <th style={{ width: 96 }}>Acao</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${field.key}-row-${rowIndex}`}>
                  {field.options.map(option => {
                    const key = option.key?.trim();
                    if (!key || option.type === undefined || option.type === null) {
                      return null;
                    }

                    return (
                      <td key={`${field.key}-${key}-${rowIndex}`}>
                        {renderStructuredCellInput(option, row[key] ?? "", `${field.key}-${key}-${rowIndex}`, next => updateRow(rowIndex, key, next))}
                      </td>
                    );
                  })}
                  <td>
                    <button className="btn btn-ghost" type="button" onClick={() => removeRow(rowIndex)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <button className="btn btn-secondary" type="button" onClick={addRow}>Adicionar item</button>
      </div>
    </div>
  );
}

function renderFieldInput(
  field: ExecutionField,
  value: unknown,
  onChange: (next: unknown) => void,
  onUpload: (fieldKey: string, file?: File | null) => Promise<void>,
  uploading: boolean
) {
  if (isStructuredListField(field)) {
    return renderStructuredListField(field, value, onChange);
  }

  if (field.type === 5) {
    return (
      <select className="select" value={toText(value)} onChange={event => onChange(event.target.value)}>
        <option value="">Selecione</option>
        {field.options.map(option => <option key={`${field.key}-${option.value}`} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (field.type === 6) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label className="toggle-line compact">
          <input type="radio" name={field.key} checked={toText(value) === "true"} onChange={() => onChange("true")} />
          Sim
        </label>
        <label className="toggle-line compact">
          <input type="radio" name={field.key} checked={toText(value) === "false"} onChange={() => onChange("false")} />
          Nao
        </label>
      </div>
    );
  }

  if (field.type === 8) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {field.options.map(option => (
          <label key={`${field.key}-${option.value}`} className="toggle-line compact">
            <input type="radio" name={field.key} checked={toText(value) === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (isUploadField(field.type)) {
    return renderUploadField(field, value, onUpload, uploading);
  }

  const inputType = resolveInputType(field.type, field.mask);
  return <input className="input" type={inputType} value={toText(value)} onChange={event => onChange(applyMask(field.mask, event.target.value))} />;
}

export default function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<Instance | null>(null);
  const [flowDefinition, setFlowDefinition] = useState<Flow | null>(null);
  const [error, setError] = useState("");
  const [gateState, setGateState] = useState<ExecutionGateState | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [uploadingFieldKey, setUploadingFieldKey] = useState("");
  const [reprocessingStepId, setReprocessingStepId] = useState("");
  const [cancelingStepId, setCancelingStepId] = useState("");
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [journeyView, setJourneyView] = useState<"timeline" | "diagram">("timeline");
  const [readerWarning, setReaderWarning] = useState("");
  const [scanning, setScanning] = useState(false);
  const [invalidFieldKeys, setInvalidFieldKeys] = useState<string[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function exitIfForbidden(cause: unknown, reason: "view" | "advance" = "view") {
    if (!(cause instanceof Error) || cause.message !== "Acesso negado.") {
      return false;
    }

    window.alert("Você concluiu sua tarefa e não possui permissão para executar a próxima etapa.");
    router.push("/tarefas");
    return true;
  }

  function handleForbiddenRedirect(cause: unknown, reason: "view" | "advance" = "view") {
    if (!(cause instanceof Error) || cause.message !== "Acesso negado.") {
      return false;
    }

    setGateState(
      reason === "advance"
        ? {
          title: "Etapa concluida com sucesso",
          message: "Sua tarefa foi finalizada e voce nao possui permissao para acessar a proxima etapa desta execucao.",
          accent: "success"
        }
        : {
          title: "Acesso negado",
          message: "Voce nao possui permissao para visualizar esta execucao no momento.",
          accent: "danger"
        }
    );
    setItem(null);
    setFlowDefinition(null);
    setError("");
    return true;
  }

  const load = (reason: "view" | "advance" = "view") => api<Instance>(`/instances/${id}`)
    .then(async result => {
      syncCurrentStepState(result, setItem, setFormData, setNotes);
      try {
        setFlowDefinition(await api<Flow>(`/flows/${result.flowDefinitionId}`));
      } catch {
        setFlowDefinition(null);
      }
    })
    .catch(e => {
      if (handleForbiddenRedirect(e, reason)) {
        return;
      }

      setError(e.message);
    });

  useEffect(() => {
    void load("view");
  }, [id]);

  const currentStep = useMemo(
    () => item?.steps.find(step => step.id === item.currentStepExecutionId) ?? item?.steps.find(step => step.status === 1),
    [item]
  );
  const readerMode = currentStep?.type === 0;
  const selectedJourneyStep = useMemo(
    () => item?.steps.find(step => expandedSteps[step.id]),
    [expandedSteps, item]
  );
  const currentStepDefinition = useMemo(
    () => currentStep && flowDefinition
      ? flowDefinition.steps.find(step => step.id === currentStep.flowStepId)
      : undefined,
    [currentStep, flowDefinition]
  );
  const automaticSchedule = useMemo(
    () => currentStep?.isAutomatic
      ? describeAutomaticSchedule(currentStepDefinition?.apiConfig, currentStep)
      : null,
    [currentStep, currentStepDefinition]
  );
  const invalidFieldSet = useMemo(() => new Set(invalidFieldKeys), [invalidFieldKeys]);

  function canReprocessStep(step: Instance["steps"][number]) {
    const isIntegration = step.type === 4 || step.type === 5;
    const isCurrentAutomatic = step.isAutomatic && step.status === 1;
    const isCompletedIntegration = isIntegration && step.status === 2;
    return isCurrentAutomatic || isCompletedIntegration;
  }

  function isStepAwaitingData(step: Instance["steps"][number]) {
    const ruleStatus = toText(step.data["_integration.responseRule.status"]);
    return ruleStatus === "waiting" || step.data["_integration.awaitingData"] === true || toText(step.data["_integration.awaitingData"]).toLowerCase() === "true";
  }

  function canCancelWaitingStep(step: Instance["steps"][number]) {
    return step.isAutomatic && step.status === 1 && isStepAwaitingData(step);
  }

  function getStepStateLabel(step: Instance["steps"][number]) {
    if (step.status === 2) {
      return step.completedAt ? `Concluída ${step.completedAt ? new Date(step.completedAt).toLocaleString("pt-BR") : ""}` : "Concluída";
    }

    if (step.status === 1) {
      return "Etapa atual";
    }

    if (step.status === 3) {
      return "Interrompida";
    }

    return "Aguardando";
  }

  function toggleStepDetails(stepId: string) {
    setExpandedSteps(current => ({ ...current, [stepId]: !current[stepId] }));
  }

  function toggleJourneyDiagramDetails(stepId: string) {
    setExpandedSteps(current => current[stepId] ? {} : { [stepId]: true });
  }

  function focusFirstInvalidField(fieldKey: string) {
    const element = fieldRefs.current[fieldKey];
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = element.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
    input?.focus();
  }

  function renderStepDetails(step: Instance["steps"][number]) {
    const technicalData = getAutomaticStepTechnicalData(step);
    const ruleStatus = toText(step.data["_integration.responseRule.status"]);
    const isAwaitingData = isStepAwaitingData(step);
    const isCancelledWaiting = ruleStatus === "cancelled";
    const awaitingDataMessage = toText(step.data["_integration.responseRule.reason"]) || toText(step.data["_integration.awaitingDataMessage"]);
    const nextAttemptAt = toText(step.data["_integration.responseRule.nextAttemptAtUtc"]);
    const attemptCount = toText(step.data["_integration.responseRule.attemptCount"]);
    const maxAttempts = toText(step.data["_integration.responseRule.maxAttempts"]);
    const emptyResultRetryMinutes = toText(step.data["_integration.responseRule.retryIntervalMinutes"]) || toText(step.data["_integration.emptyResultRetryMinutes"]);
    const ruleMode = toText(step.data["_integration.responseRule.mode"]);
    const actualValue = toText(step.data["_integration.responseRule.actualValue"]);
    const expectedValue = toText(step.data["_integration.responseRule.expectedValue"]);

    return (
      <div style={{ marginTop: 14, paddingLeft: 38 }}>
        {(canReprocessStep(step) || canCancelWaitingStep(step)) && (
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {canCancelWaitingStep(step) && (
                <button className="btn btn-secondary" type="button" onClick={() => void cancelWaitingStep(step.id)} disabled={cancelingStepId === step.id}>
                  <Square size={16} />
                  {cancelingStepId === step.id ? "Cancelando..." : "Cancelar tentativas"}
                </button>
              )}
              {canReprocessStep(step) && (
                <button className="btn btn-secondary" type="button" onClick={() => void reprocessStep(step.id)} disabled={reprocessingStepId === step.id}>
                  <RotateCw size={16} />
                  {reprocessingStepId === step.id ? "Reprocessando..." : "Reprocessar etapa"}
                </button>
              )}
            </div>
          </div>
        )}

        {isAwaitingData && (
          <div className="notice" style={{ marginBottom: 16 }}>
            <strong>{ruleMode === "condition" ? "Consulta aguardando condição da API" : "Consulta aguardando retorno com conteúdo"}</strong>
            <div style={{ marginTop: 8 }}>
              {awaitingDataMessage || "A API respondeu com lista vazia e o sistema continuará tentando automaticamente."}
            </div>
            {(actualValue || expectedValue) && (
              <div className="section-copy" style={{ marginTop: 6 }}>
                {actualValue ? `Valor atual: ${actualValue}. ` : ""}
                {expectedValue ? `Esperado: ${expectedValue}.` : ""}
              </div>
            )}
            {emptyResultRetryMinutes && (
              <div className="section-copy" style={{ marginTop: 6 }}>
                Nova consulta prevista a cada {emptyResultRetryMinutes} minuto(s).
              </div>
            )}
            {(attemptCount || maxAttempts || nextAttemptAt) && (
              <div className="section-copy" style={{ marginTop: 6 }}>
                {attemptCount && maxAttempts ? `Tentativa ${attemptCount} de ${maxAttempts}. ` : ""}
                {nextAttemptAt ? `Próxima tentativa: ${nextAttemptAt}.` : ""}
              </div>
            )}
          </div>
        )}

        {isCancelledWaiting && (
          <div className="notice" style={{ marginBottom: 16 }}>
            <strong>Consulta automática interrompida manualmente</strong>
            <div style={{ marginTop: 8 }}>
              {awaitingDataMessage || "As novas tentativas foram canceladas e esta etapa não fará novas consultas automaticamente."}
            </div>
          </div>
        )}

        {step.fields.length > 0 && (
          <>
            <strong>Dados da etapa</strong>
            <div className="data-list" style={{ marginTop: 10 }}>
              {step.fields.map(field => {
                const uploadAssets = isUploadField(field.type) ? parseUploadAssets(step.data[field.key]) : [];
                const structuredRows = isStructuredListField(field) ? parseStructuredRows(step.data[field.key]) : [];

                return (
                  <div className="data-item" key={`${step.id}-${field.key}`}>
                    <small>{field.label}</small>
                    {uploadAssets.length > 0 ? (
                      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                        {uploadAssets.map(asset => (
                          <a key={asset.id} href={buildAssetUrl(asset.url)} target="_blank" rel="noreferrer">
                            {asset.fileName}
                          </a>
                        ))}
                      </div>
                    ) : structuredRows.length > 0 ? (
                      <div className="tablewrap" style={{ marginTop: 6, border: "1px solid var(--line)", borderRadius: 14 }}>
                        <table className="table">
                          <thead>
                            <tr>
                              {field.options.map(option => {
                                const key = option.key?.trim();
                                if (!key) {
                                  return null;
                                }

                                return <th key={`${field.key}-history-header-${key}`}>{option.label}</th>;
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {structuredRows.map((row, rowIndex) => (
                              <tr key={`${field.key}-history-row-${rowIndex}`}>
                                {field.options.map(option => {
                                  const key = option.key?.trim();
                                  if (!key) {
                                    return null;
                                  }

                                  return <td key={`${field.key}-${key}-${rowIndex}`}>{toText(row[key]) || "-"}</td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <strong>{field.value || "-"}</strong>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {technicalData.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <strong>Dados técnicos da automação</strong>
            <div className="data-list" style={{ marginTop: 10 }}>
              {technicalData.map(([key, value]) => (
                <div className="data-item" key={`${step.id}-${key}`}>
                  <small>{formatTechnicalDataLabel(key)}</small>
                  {key === "_integration.responsePreview" || key === "_integration.requestHeaders" || key === "_integration.requestBody" || key === "_integration.mappingResult" ? (
                    <PreviewBlock value={value} />
                  ) : (
                    <strong>{toText(value) || "-"}</strong>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step.integrationAttempts.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <strong>Integrações da etapa</strong>
            <div className="data-list" style={{ marginTop: 10 }}>
              {step.integrationAttempts.map(attempt => (
                <div className="data-item" key={attempt.id}>
                  <small>{attempt.method} | {new Date(attempt.createdAt).toLocaleString("pt-BR")}</small>
                  <strong>{attempt.success ? "Sucesso" : "Falha"} - {attempt.responseStatusCode ?? "sem status"}</strong>
                  <div className="section-copy" style={{ marginTop: 4, wordBreak: "break-word" }}>{attempt.url}</div>
                  {attempt.requestHeaders && <PreviewBlock title="Headers enviados" value={attempt.requestHeaders} />}
                  {attempt.requestBody && <PreviewBlock title="Body enviado" value={attempt.requestBody} />}
                  {attempt.responsePreview && <PreviewBlock title="Resposta" value={attempt.responsePreview} />}
                  {attempt.errorMessage && <div className="section-copy" style={{ marginTop: 8 }}>{attempt.errorMessage}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function applyReaderData(nextData: Record<string, unknown>) {
    if (!currentStep) {
      setFormData(current => ({ ...current, ...nextData }));
      return 0;
    }

    const normalizedEntries = Object.entries(nextData).map(([key, value]) => ({
      key,
      value,
      aliases: expandReaderAliases(key)
    }));

    const mappedEntries: Array<[string, unknown]> = [];
    for (const field of currentStep.fields) {
      const candidates = buildReaderCandidates(field);
      const match = normalizedEntries.find(entry => [...entry.aliases].some(alias => candidates.has(alias)));
      if (!match) {
        continue;
      }

      if (isStructuredListField(field)) {
        const structuredRows = mapStructuredReaderRows(field, match.value);
        if (structuredRows.length > 0) {
          mappedEntries.push([field.key, structuredRows]);
        }
        continue;
      }

      mappedEntries.push([field.key, coerceReaderValue(field, match.value)]);
    }

    if (mappedEntries.length === 0) {
      setFormData(current => ({ ...current, ...nextData }));
      return 0;
    }

    setFormData(current => ({ ...current, ...Object.fromEntries(mappedEntries) }));
    return mappedEntries.length;
  }

  async function readPdf(file?: File) {
    if (!file) {
      return;
    }

    setReaderWarning("");

    try {
      const result = await readDanfeFileInBrowser(file);
      const matchedFields = applyReaderData(result.fields);
      const warnings = [...result.warnings];
      if (!matchedFields && Object.keys(result.fields).length > 0) {
        warnings.push("Os dados foram lidos, mas não combinaram com os campos configurados nesta etapa.");
      }

      setReaderWarning(warnings.join(" "));
    } catch (e) {
      setReaderWarning(e instanceof Error ? e.message : "Falha na leitura do PDF no navegador.");
    }
  }

  async function scanCode() {
    setReaderWarning("");
    if (!navigator.mediaDevices) {
      setReaderWarning("Câmera indisponível. Use o coletor como teclado nos campos da etapa.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setScanning(true);

      setTimeout(() => {
        if (video.current) {
          video.current.srcObject = stream;
          void video.current.play();
        }
      }, 0);

      const Detector = (window as unknown as {
        BarcodeDetector?: new (args: { formats: string[] }) => { detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
      }).BarcodeDetector;

      if (!Detector) {
        setReaderWarning("Este navegador não oferece leitura nativa. Use o coletor físico ou preencha manualmente.");
        return;
      }

      const detector = new Detector({ formats: ["qr_code", "code_128", "ean_13", "data_matrix"] });
      const loop = async () => {
        if (!video.current) {
          return;
        }

        const codes = await detector.detect(video.current);
        if (codes[0]) {
          applyReaderData({ chaveAcesso: codes[0].rawValue });
          stream.getTracks().forEach(track => track.stop());
          setScanning(false);
          return;
        }

        if (stream.active) {
          requestAnimationFrame(loop);
        }
      };

      setTimeout(() => void loop(), 700);
    } catch {
      setReaderWarning("Não foi possível abrir a câmera. Verifique a permissão e use HTTPS ou localhost.");
    }
  }

  async function uploadFile(fieldKey: string, file?: File | null) {
    if (!file) {
      return;
    }

    setUploadingFieldKey(fieldKey);
    setError("");

    try {
      const body = new FormData();
      body.append("fieldKey", fieldKey);
      body.append("file", file);
      const result = await api<Instance>(`/instances/${id}/upload`, { method: "POST", body });
      setItem(result);
      const { currentStep: nextStep, formData: nextServerData } = buildCurrentStepFormData(result);
      setFormData(current => {
        if (!nextStep) {
          return {};
        }

        return { ...current, ...nextServerData, [fieldKey]: nextServerData[fieldKey] ?? current[fieldKey] ?? [] };
      });
      setNotes(nextStep?.notes ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploadingFieldKey("");
    }
  }

  async function saveStep() {
    if (!currentStep) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const result = await api<Instance>(`/instances/${id}/save-step`, {
        method: "POST",
        body: JSON.stringify({
          notes,
          data: sanitizeStepPayload(currentStep, formData)
        })
      });
      syncCurrentStepState(result, setItem, setFormData, setNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a etapa.");
    } finally {
      setSaving(false);
    }
  }

  async function advance() {
    if (!currentStep) {
      return;
    }

    setError("");
    const issues = getRequiredFieldIssues(currentStep, formData);
    if (issues.length > 0) {
      const uniqueFieldKeys = [...new Set(issues.map(issue => issue.fieldKey))];
      setInvalidFieldKeys(uniqueFieldKeys);
      setError(`Preencha os campos obrigatórios antes de concluir: ${issues.map(issue => issue.message).join(", ")}.`);
      focusFirstInvalidField(uniqueFieldKeys[0]);
      return;
    }

    setInvalidFieldKeys([]);
    setAdvancing(true);

    try {
      await api(`/instances/${id}/advance`, {
        method: "POST",
        body: JSON.stringify({
          notes,
          data: sanitizeStepPayload(currentStep, formData)
        })
      });
      await load("advance");
    } catch (e) {
      if (handleForbiddenRedirect(e)) {
        return;
      }

      setError(e instanceof Error ? e.message : "Não foi possível concluir a etapa.");
    } finally {
      setAdvancing(false);
    }
  }

  async function reprocessStep(stepId: string) {
    setReprocessingStepId(stepId);
    setError("");

    try {
      const result = await api<Instance>(`/instances/${id}/steps/${stepId}/reprocess`, {
        method: "POST"
      });
      syncCurrentStepState(result, setItem, setFormData, setNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível reprocessar a etapa.");
    } finally {
      setReprocessingStepId("");
    }
  }

  async function cancelWaitingStep(stepId: string) {
    setCancelingStepId(stepId);
    setError("");

    try {
      const result = await api<Instance>(`/instances/${id}/steps/${stepId}/cancel-waiting`, {
        method: "POST"
      });
      syncCurrentStepState(result, setItem, setFormData, setNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cancelar as tentativas automáticas.");
    } finally {
      setCancelingStepId("");
    }
  }

  const gateToast = gateState ? (
    <div className="toast-stack" aria-live="polite">
      <div className={`toast-card card ${gateState.accent === "success" ? "toast-card-success" : "toast-card-danger"}`}>
        <div className="toast-head">
          <div className={`toast-icon ${gateState.accent === "success" ? "toast-icon-success" : "toast-icon-danger"}`}>
            {gateState.accent === "success" ? <Check size={18} /> : <ShieldAlert size={18} />}
          </div>
          <button className="toast-close" type="button" aria-label="Fechar aviso" onClick={() => setGateState(null)}>
            ×
          </button>
        </div>
        <span className="toast-eyebrow">{gateState.accent === "success" ? "Execucao concluida" : "Permissao necessaria"}</span>
        <strong className="toast-title">{gateState.title}</strong>
        <p className="toast-copy">{gateState.message}</p>
        <div className="toast-actions">
          <button className="btn btn-primary" type="button" onClick={() => router.push("/tarefas")}>
            Voltar para tarefas
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (!item && !gateState) {
    return <div className="empty">Carregando execução...</div>;
  }

  if (gateState) {
    return gateToast;
  }

  if (!item) {
    return null;
  }

  return (
    <>
      {gateToast}
      <Link href="/" className="btn btn-ghost"><ArrowLeft size={16} />Voltar</Link>

      <div className="pagehead">
        <div>
          <span className="eyebrow">{item.flowName}</span>
          <h1 className="title">{buildReaderCode(currentStep, formData) || item.code}</h1>
          <p className="subtitle">Criado em {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
        </div>
        <span className={`badge ${item.status === 0 ? "inprogress" : "completed"}`}>{item.status === 0 ? "Em andamento" : "Concluído"}</span>
      </div>

      <div className="detailstack">
        <section className="card">
          <div style={{ padding: "24px 24px 0" }}>
            <h2 className="section-title">Execução da etapa atual</h2>
            {currentStep && <h1 style={{ fontSize: 36, lineHeight: 1.05, margin: "8px 0 10px", letterSpacing: "-0.04em" }}>{currentStep.name}</h1>}
            <p className="section-copy">
              {currentStep ? `Preencha os campos e conclua a etapa "${currentStep.name}".` : "Nenhuma etapa manual ativa no momento."}
            </p>
            {error && (
              <div
                className="error"
                role="alert"
                aria-live="assertive"
                style={{ marginTop: 16, marginBottom: 0, border: "1px solid #f4c7c3", boxShadow: "0 10px 24px rgba(201,77,69,.08)" }}
              >
                {error}
              </div>
            )}
          </div>

          {currentStep && !currentStep.isAutomatic && (
            <div className="formgrid" style={{ padding: 24 }}>
              {readerMode && (
                <div className="field span2">
                  <div className="scanbox">
                    <strong>Entrada assistida</strong>
                    <p className="section-copy">Leia um DANFE digital ou capture o código pela câmera para preencher a etapa atual.</p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <label className="btn btn-secondary">
                        <Paperclip size={16} />
                        Ler PDF
                        <input hidden type="file" accept="application/pdf" onChange={event => void readPdf(event.target.files?.[0])} />
                      </label>
                      <button className="btn btn-secondary" type="button" onClick={scanCode}>
                        <Camera size={16} />
                        Abrir câmera
                      </button>
                    </div>
                    {scanning && <video ref={video} className="camera" muted playsInline />}
                    {readerWarning && <div className="notice" style={{ marginTop: 12 }}>{readerWarning}</div>}
                  </div>
                </div>
              )}

              {currentStep.fields.map(field => (
                <div
                  className={`field ${isStructuredListField(field) ? "span2" : ""}`}
                  key={`${currentStep.id}-${field.key}`}
                  ref={element => {
                    fieldRefs.current[field.key] = element;
                  }}
                >
                  <label>{field.label}{field.required ? " *" : ""}</label>
                  <div
                    style={invalidFieldSet.has(field.key)
                      ? {
                        border: "1px solid var(--danger)",
                        borderRadius: 12,
                        padding: 6,
                        background: "#fff7f6",
                        boxShadow: "0 0 0 3px rgba(201,77,69,.10)"
                      }
                      : undefined}
                  >
                    {renderFieldInput(
                      field,
                      formData[field.key] ?? (isStructuredListField(field) ? [] : ""),
                      next => {
                        setFormData(current => ({ ...current, [field.key]: next }));
                        if (invalidFieldSet.has(field.key)) {
                          setInvalidFieldKeys(current => current.filter(key => key !== field.key));
                        }
                      },
                      uploadFile,
                      uploadingFieldKey === field.key
                    )}
                  </div>
                  {invalidFieldSet.has(field.key) && (
                    <small style={{ color: "var(--danger)", fontWeight: 700 }}>Campo obrigatório.</small>
                  )}
                </div>
              ))}

              <div className="field span2">
                <label>Observações da etapa</label>
                <textarea className="textarea" value={notes} onChange={event => setNotes(event.target.value)} />
              </div>
            </div>
          )}

          {currentStep?.isAutomatic && (
            <div style={{ margin: 24, display: "grid", gap: 12 }}>
              <div className="notice">
                Esta etapa é automática. Use o histórico abaixo para acompanhar a execução sistêmica ou consultar detalhes da integração.
              </div>
              {automaticSchedule && (
                <div className="data-list" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <div className="data-item">
                    <small>Agendamento configurado</small>
                    <strong>{automaticSchedule.label}</strong>
                    <div className="section-copy" style={{ marginTop: 6 }}>{automaticSchedule.detail}</div>
                  </div>
                  <div className="data-item">
                    <small>Próxima execução prevista</small>
                    <strong>{automaticSchedule.nextAt ? formatScheduleDate(automaticSchedule.nextAt) : "Não foi possível calcular"}</strong>
                    <div className="section-copy" style={{ marginTop: 6 }}>
                      O worker verifica etapas agendadas em ciclos de aproximadamente 30 segundos.
                    </div>
                  </div>
                </div>
              )}
              {(canReprocessStep(currentStep) || canCancelWaitingStep(currentStep)) && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {canCancelWaitingStep(currentStep) && (
                      <button className="btn btn-secondary" type="button" onClick={() => void cancelWaitingStep(currentStep.id)} disabled={cancelingStepId === currentStep.id}>
                        <Square size={16} />
                        {cancelingStepId === currentStep.id ? "Cancelando..." : "Cancelar tentativas"}
                      </button>
                    )}
                    {canReprocessStep(currentStep) && (
                      <button className="btn btn-secondary" type="button" onClick={() => void reprocessStep(currentStep.id)} disabled={reprocessingStepId === currentStep.id}>
                        <RotateCw size={16} />
                        {reprocessingStepId === currentStep.id ? "Reprocessando..." : "Reprocessar etapa"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="actions" style={{ padding: "0 24px 24px" }}>
            {currentStep && !currentStep.isAutomatic && (
              <>
                <button className="btn btn-secondary" type="button" onClick={saveStep} disabled={saving || !!uploadingFieldKey}>
                  <Save size={16} />
                  {saving ? "Salvando..." : "Salvar dados"}
                </button>
                <button className="btn btn-primary" type="button" onClick={advance} disabled={advancing || !!uploadingFieldKey}>
                  <Check size={16} />
                  {advancing ? "Concluindo..." : "Concluir etapa"}
                </button>
              </>
            )}
          </div>
        </section>

        <section className="card timeline">
          <div className="section-header">
            <div>
              <h2 className="section-title">Jornada do registro</h2>
              <p className="section-copy">Acompanhe o status, executor e os detalhes de cada etapa.</p>
            </div>
            <div className="view-toggle" role="tablist" aria-label="Modo de visualização da jornada">
              <button
                className={`view-toggle-btn ${journeyView === "timeline" ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={journeyView === "timeline"}
                onClick={() => setJourneyView("timeline")}
              >
                Visão 1
              </button>
              <button
                className={`view-toggle-btn ${journeyView === "diagram" ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={journeyView === "diagram"}
                onClick={() => setJourneyView("diagram")}
              >
                Visão 2
              </button>
            </div>
          </div>

          {journeyView === "timeline" && item.steps.map(step => {
            const expanded = !!expandedSteps[step.id];
            return (
              <div key={step.id} className={`timeline-row ${step.status === 2 ? "done" : step.status === 1 ? "current" : step.status === 3 ? "failed" : ""}`} style={{ display: "block" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="timeline-dot">{step.status === 2 ? <Check size={14} /> : step.status === 1 ? <Play size={13} /> : step.status === 3 ? <Square size={13} /> : <Clock size={13} />}</span>
                  <div style={{ flex: 1 }}>
                    <strong>{step.name}</strong>
                    <div className="section-copy" style={{ marginTop: 4 }}>
                      {getStepStateLabel(step)}
                    </div>
                    <div className="section-copy" style={{ marginTop: 4 }}>
                      {step.isAutomatic ? "Execução automática/sistêmica" : `Executado por ${step.completedByName || "usuário não identificado"}`}
                    </div>
                  </div>
                  <small>Etapa {step.order}</small>
                  <button className="btn btn-ghost" type="button" onClick={() => toggleStepDetails(step.id)}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    Mais informações
                  </button>
                </div>

                {expanded && renderStepDetails(step)}
              </div>
            );
          })}

          {journeyView === "diagram" && (
            <div className="journey-diagram">
              <div className="step-diagram-scroll">
                <div className="step-diagram-canvas" role="list" aria-label="Jornada do registro em diagrama">
                  {item.steps.map(step => {
                    const expanded = !!expandedSteps[step.id];
                    const stateLabel = step.status === 2 ? "Concluída" : step.status === 1 ? "Atual" : step.status === 3 ? "Interrompida" : "Aguardando";
                    const actorLabel = step.isAutomatic ? "Execução automática/sistêmica" : `Executado por ${step.completedByName || "usuário não identificado"}`;

                    return (
                      <div key={step.id} className={`diagram-node ${step.status === 1 ? "active" : step.status === 3 ? "failed" : ""}`} role="listitem">
                        <button className="diagram-node-card" type="button" onClick={() => toggleJourneyDiagramDetails(step.id)}>
                          <div className="diagram-node-top">
                            <span className="step-chip">{step.order}</span>
                            <span className="diagram-node-kind">{stateLabel}</span>
                          </div>
                          <strong>{step.name}</strong>
                          <small>{actorLabel}</small>
                          <div className="step-meta">
                            <span>Etapa {step.order}</span>
                            {step.integrationAttempts.length > 0 && <span>Integração</span>}
                          </div>
                        </button>

                        <div className="diagram-node-actions">
                          <button className="btn btn-ghost btn-inline" type="button" onClick={() => toggleJourneyDiagramDetails(step.id)}>
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            Mais informações
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedJourneyStep && (
                <div className="journey-diagram-panel">
                  <div className="journey-diagram-panel-head">
                    <div>
                      <span className="eyebrow">Etapa {selectedJourneyStep.order}</span>
                      <h3>{selectedJourneyStep.name}</h3>
                      <p className="section-copy">
                        {selectedJourneyStep.status === 2
                          ? `Concluída ${selectedJourneyStep.completedAt ? new Date(selectedJourneyStep.completedAt).toLocaleString("pt-BR") : ""}`
                          : selectedJourneyStep.status === 1
                            ? "Etapa atual em execução."
                            : selectedJourneyStep.status === 3
                              ? "Etapa interrompida manualmente."
                              : "Etapa aguardando liberação."}
                      </p>
                    </div>
                    <button className="btn btn-ghost" type="button" onClick={() => toggleJourneyDiagramDetails(selectedJourneyStep.id)}>
                      <ChevronUp size={16} />
                      Recolher
                    </button>
                  </div>

                  <div className="journey-diagram-details journey-diagram-details-wide">
                    {renderStepDetails(selectedJourneyStep)}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
