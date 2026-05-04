import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RawRecord = Record<string, unknown>;
type InvoiceGroup = "overdue" | "open" | "paid" | "other";

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

class RastroApiError extends Error {
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

async function apiGet(path: string, params: Record<string, string>) {
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

function dataArray(payload: unknown): RawRecord[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data.filter(isRecord) : [];
}

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown): string | null {
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

function cpfCnpjDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpfCnpj(value: string) {
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

function normalizeConta(conta: RawRecord) {
  const status = asString(conta.status) ?? "";
  const group = groupFromConta(conta);

  return {
    id: asString(conta.id),
    parcela: asString(conta.parcelas ?? conta.parcela),
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

function summaryFromContas(contas: RawRecord[]) {
  const normalized = contas.map(normalizeConta);
  const totalValor = normalized.reduce((sum, conta) => sum + (conta.valor ?? 0), 0);
  const totalPago = normalized.reduce((sum, conta) => sum + (conta.valorPago ?? 0), 0);

  const countByGroup = normalized.reduce(
    (acc, conta) => {
      acc[conta.grupo] += 1;
      return acc;
    },
    { overdue: 0, open: 0, paid: 0, other: 0 } satisfies Record<InvoiceGroup, number>
  );

  return {
    valorTotalContas: asNumber(firstSummaryValue(contas, "valor_total_contas")) ?? totalValor,
    valorVencidas: asNumber(firstSummaryValue(contas, "valor_vencidas")),
    valorAbertas: asNumber(firstSummaryValue(contas, "valor_abertas")),
    valorPagas: asNumber(firstSummaryValue(contas, "valor_pagas")) ?? totalPago,
    countTotalContas: asInt(firstSummaryValue(contas, "count_total_contas")) ?? normalized.length,
    countVencidas: asInt(firstSummaryValue(contas, "count_vencidas")) ?? countByGroup.overdue,
    countAbertas: asInt(firstSummaryValue(contas, "count_abertas")) ?? countByGroup.open,
    countPagas: asInt(firstSummaryValue(contas, "count_pagas")) ?? countByGroup.paid,
    countOutras: countByGroup.other
  };
}

async function findPessoa(cpfCnpj: string) {
  const formatted = formatCpfCnpj(cpfCnpj);
  const digits = cpfCnpjDigits(cpfCnpj);
  const attempts: Array<Record<string, string>> = [
    { cpf_cnpj: formatted, st: "ativo", page: "0", limit: "10" },
    { cpf_cnpj: formatted, status: "2", page: "0", limit: "10" },
    { cpf_cnpj: digits, st: "ativo", page: "0", limit: "10" }
  ];

  let lastPayload: unknown = null;

  for (const params of attempts) {
    lastPayload = await apiGet("list-pessoas", params);
    const pessoas = dataArray(lastPayload);

    if (pessoas.length > 0) {
      return { pessoa: pessoas[0], raw: lastPayload, parametros: params };
    }
  }

  return { pessoa: null, raw: lastPayload, parametros: attempts[attempts.length - 1] };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { cpfCnpj?: unknown };
    const cpfCnpj = asString(body.cpfCnpj)?.trim() ?? "";
    const digits = cpfCnpjDigits(cpfCnpj);

    if (digits.length !== 11 && digits.length !== 14) {
      return NextResponse.json(
        { message: "Informe um CPF ou CNPJ válido." },
        { status: 400 }
      );
    }

    const pessoaResult = await findPessoa(cpfCnpj);

    if (!pessoaResult.pessoa) {
      return NextResponse.json(
        {
          message: "Nenhuma pessoa ativa encontrada para esse documento.",
          raw: { pessoas: pessoaResult.raw }
        },
        { status: 404 }
      );
    }

    const pessoaId = asString(pessoaResult.pessoa.id);

    if (!pessoaId) {
      return NextResponse.json(
        {
          message: "A pessoa encontrada não possui ID no retorno da API.",
          raw: { pessoas: pessoaResult.raw }
        },
        { status: 422 }
      );
    }

    const financeiro = await apiGet("get-financeiro-v2", {
      tipo: "1",
      pessoa_id: pessoaId,
      page: "0",
      limit: "100"
    });
    const contas = dataArray(financeiro);
    const faturas = contas
      .map(normalizeConta)
      .sort((a, b) => (a.vencimentoSort ?? "9999-99-99").localeCompare(b.vencimentoSort ?? "9999-99-99"));

    return NextResponse.json({
      pessoa: {
        id: pessoaId,
        nome: asString(pessoaResult.pessoa.nome_razao_social),
        cpfCnpj: asString(pessoaResult.pessoa.cpf_cnpj) ?? formatCpfCnpj(cpfCnpj),
        telefone: asString(pessoaResult.pessoa.fone),
        email: asString(pessoaResult.pessoa.email)
      },
      resumo: summaryFromContas(contas),
      faturas,
      raw: {
        pessoas: pessoaResult.raw,
        financeiro
      }
    });
  } catch (error) {
    if (error instanceof RastroApiError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status >= 500 ? 502 : error.status }
      );
    }

    return NextResponse.json(
      { message: "Erro inesperado ao consultar faturas." },
      { status: 500 }
    );
  }
}
