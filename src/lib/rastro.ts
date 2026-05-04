export type RawRecord = Record<string, unknown>;
export type InvoiceGroup = "overdue" | "open" | "paid" | "other";

export type NormalizedInvoice = {
  id: string | null;
  parcela: string | null;
  descricao: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  valor: number | null;
  valorOriginal: string | null;
  valorPago: number | null;
  valorPagoOriginal: string | null;
  vencimento: string | null;
  vencimentoSort: string | null;
  pagamento: string | null;
  statusCodigo: string;
  statusLabel: string;
  grupo: InvoiceGroup;
  linkBoleto: string | null;
  formaPagamento: string | null;
  qrcode: string | null;
  linhaDigitavel: string | null;
};

export type FinanceSummary = {
  valorTotalContas: number | null;
  valorVencidas: number | null;
  valorAbertas: number | null;
  valorPagas: number | null;
  countTotalContas: number;
  countVencidas: number;
  countAbertas: number;
  countPagas: number;
  countOutras: number;
};

const STATUS_LABELS: Record<string, string> = {
  "1": "Pago",
  "2": "Aberto",
  "3": "Vencido",
  "4": "Pago manual",
  "5": "Conta morta",
  "6": "Crédito recusado",
  "7": "Cartão pendente",
  "8": "Invalidado"
};

export const GROUP_STATUS_CODES: Record<InvoiceGroup, string[]> = {
  paid: ["1", "4"],
  open: ["2"],
  overdue: ["3"],
  other: ["5", "6", "7", "8"]
};

export class RastroApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "RastroApiError";
    this.status = status;
    this.details = details;
  }
}

function getApiConfig() {
  const token = process.env.RASTRO_API_TOKEN?.trim();
  const baseUrl = (
    process.env.RASTRO_API_BASE_URL ?? "https://batista.rastrosystem.com.br/api_v2"
  ).replace(/\/$/, "");

  if (!token) {
    throw new RastroApiError(
      "RASTRO_API_TOKEN não configurado no ambiente do servidor.",
      500,
      null
    );
  }

  return { token, baseUrl };
}

export async function apiGet(path: string, params: Record<string, string>) {
  const { token, baseUrl } = getApiConfig();
  const url = new URL(`${baseUrl}/${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      Authorization: `token ${token}`
    },
    cache: "no-store"
  });

  const text = await response.text();
  let payload: unknown = text;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 1200) };
  }

  if (!response.ok) {
    throw new RastroApiError(
      `Falha na API Rastrosystem (${response.status}).`,
      response.status,
      payload
    );
  }

  return payload;
}

export function dataArray(payload: unknown): RawRecord[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data.filter(isRecord) : [];
}

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function asString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function asInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function cpfCnpjDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCpfCnpj(value: string) {
  const digits = cpfCnpjDigits(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5"
    );
  }

  return value.trim();
}

function dateSortKey(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDate) {
    return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function displayDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brDate) {
    return `${brDate[1]}/${brDate[2]}/${brDate[3]}`;
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function groupFromConta(conta: RawRecord): InvoiceGroup {
  const status = asString(conta.status);

  if (conta.vencido === true || status === "3") {
    return "overdue";
  }

  if (status === "1" || status === "4") {
    return "paid";
  }

  if (status === "2") {
    return "open";
  }

  return "other";
}

export function normalizeConta(conta: RawRecord): NormalizedInvoice {
  const status = asString(conta.status) ?? "";
  const group = groupFromConta(conta);

  return {
    id: asString(conta.id),
    parcela: asString(conta.parcelas ?? conta.parcela),
    descricao: asString(conta.conta_descricao ?? conta.descricao),
    clienteId: asString(conta.cliente_id ?? conta.pessoa_id),
    clienteNome: asString(conta.nome_razao_social ?? conta.nome_cliente),
    valor: asNumber(conta.valor),
    valorOriginal: asString(conta.valor),
    valorPago: asNumber(conta.valor_pago),
    valorPagoOriginal: asString(conta.valor_pago),
    vencimento: displayDate(conta.data_vencimento),
    vencimentoSort: dateSortKey(conta.data_vencimento),
    pagamento: displayDate(
      conta.data_pagamento ??
        conta.dt_pagamento ??
        conta.data_baixa ??
        conta.data_pago
    ),
    statusCodigo: status,
    statusLabel: STATUS_LABELS[status] ?? (group === "overdue" ? "Vencido" : "Outro"),
    grupo: group,
    linkBoleto: asString(conta.link_boleto),
    formaPagamento: asString(conta.frm_pagamento),
    qrcode: asString(conta.qrcode),
    linhaDigitavel: asString(conta.linha_digitavel)
  };
}

function firstSummaryValue(contas: RawRecord[], field: string) {
  return contas.find((conta) => conta[field] !== undefined)?.[field];
}

export function summaryFromInvoices(invoices: NormalizedInvoice[]): FinanceSummary {
  const emptySummary = {
    valorTotalContas: 0,
    valorVencidas: 0,
    valorAbertas: 0,
    valorPagas: 0,
    countTotalContas: invoices.length,
    countVencidas: 0,
    countAbertas: 0,
    countPagas: 0,
    countOutras: 0
  };

  return invoices.reduce<FinanceSummary>((summary, invoice) => {
    const valor = invoice.valor ?? 0;
    const valorPago = invoice.valorPago ?? 0;

    summary.valorTotalContas = (summary.valorTotalContas ?? 0) + valor;

    if (invoice.grupo === "overdue") {
      summary.countVencidas += 1;
      summary.valorVencidas = (summary.valorVencidas ?? 0) + valor;
    } else if (invoice.grupo === "open") {
      summary.countAbertas += 1;
      summary.valorAbertas = (summary.valorAbertas ?? 0) + valor;
    } else if (invoice.grupo === "paid") {
      summary.countPagas += 1;
      summary.valorPagas = (summary.valorPagas ?? 0) + (valorPago || valor);
    } else {
      summary.countOutras += 1;
    }

    return summary;
  }, emptySummary);
}

export function summaryFromContas(
  contas: RawRecord[],
  preferApiSummary = true
): FinanceSummary {
  const normalized = contas.map(normalizeConta);
  const computed = summaryFromInvoices(normalized);

  if (!preferApiSummary) {
    return computed;
  }

  return {
    valorTotalContas:
      asNumber(firstSummaryValue(contas, "valor_total_contas")) ??
      computed.valorTotalContas,
    valorVencidas:
      asNumber(firstSummaryValue(contas, "valor_vencidas")) ??
      computed.valorVencidas,
    valorAbertas:
      asNumber(firstSummaryValue(contas, "valor_abertas")) ??
      computed.valorAbertas,
    valorPagas:
      asNumber(firstSummaryValue(contas, "valor_pagas")) ?? computed.valorPagas,
    countTotalContas:
      asInt(firstSummaryValue(contas, "count_total_contas")) ??
      computed.countTotalContas,
    countVencidas:
      asInt(firstSummaryValue(contas, "count_vencidas")) ?? computed.countVencidas,
    countAbertas:
      asInt(firstSummaryValue(contas, "count_abertas")) ?? computed.countAbertas,
    countPagas:
      asInt(firstSummaryValue(contas, "count_pagas")) ?? computed.countPagas,
    countOutras: computed.countOutras
  };
}

export function sortInvoices(invoices: NormalizedInvoice[]) {
  return invoices.sort((a, b) =>
    (a.vencimentoSort ?? "9999-99-99").localeCompare(
      b.vencimentoSort ?? "9999-99-99"
    )
  );
}

export function toBrDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function uniqueInvoices(invoices: NormalizedInvoice[]) {
  const seen = new Set<string>();
  const unique: NormalizedInvoice[] = [];

  for (const invoice of invoices) {
    const key = invoice.id ?? `${invoice.clienteId}-${invoice.parcela}-${invoice.vencimento}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(invoice);
    }
  }

  return unique;
}

export async function findPessoaByCpfCnpj(cpfCnpj: string) {
  const formatted = formatCpfCnpj(cpfCnpj);
  const digits = cpfCnpjDigits(cpfCnpj);
  const attempts: Array<Record<string, string>> = [
    { cpf_cnpj: formatted, st: "ativo", page: "0", limit: "10" },
    { cpf_cnpj: formatted, status: "2", page: "0", limit: "10" },
    { cpf_cnpj: digits, st: "ativo", page: "0", limit: "10" }
  ];

  for (const params of attempts) {
    const payload = await apiGet("list-pessoas", params);
    const pessoas = dataArray(payload);

    if (pessoas.length > 0) {
      return pessoas[0];
    }
  }

  return null;
}

export async function financeiroPorPessoaId(pessoaId: string, limit = "100") {
  return apiGet("get-financeiro-v2", {
    tipo: "1",
    pessoa_id: pessoaId,
    page: "0",
    limit
  });
}

export function pessoaFinanceiraPayload(pessoa: RawRecord, cpfCnpj: string) {
  return {
    id: asString(pessoa.id) ?? "",
    nome: asString(pessoa.nome_razao_social),
    cpfCnpj: asString(pessoa.cpf_cnpj) ?? formatCpfCnpj(cpfCnpj),
    telefone: asString(pessoa.fone),
    email: asString(pessoa.email)
  };
}
