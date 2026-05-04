import { NextResponse } from "next/server";
import {
  apiGet,
  asString,
  dataArray,
  GROUP_STATUS_CODES,
  InvoiceGroup,
  normalizeConta,
  RastroApiError,
  sortInvoices,
  summaryFromInvoices,
  toBrDate,
  uniqueInvoices
} from "../../../lib/rastro";
import type { RawRecord } from "../../../lib/rastro";

export const dynamic = "force-dynamic";

const VALID_GROUPS = new Set<InvoiceGroup>(["paid", "overdue", "open", "other"]);
const PAGE_LIMIT = 500;

function parseStatusGroups(value: unknown): InvoiceGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((group): group is InvoiceGroup => VALID_GROUPS.has(group));
}

function isInputDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function fetchContasByStatus(
  baseParams: Record<string, string>,
  status: string
) {
  const contas: RawRecord[] = [];

  const payload = await apiGet("get-financeiro-v2", {
    ...baseParams,
    status,
    page: "0",
    limit: String(PAGE_LIMIT)
  });
  const pageContas = dataArray(payload);

  contas.push(...pageContas);

  return {
    contas,
    limiteAtingido: pageContas.length >= PAGE_LIMIT
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      dataIni?: unknown;
      dataFim?: unknown;
      periodo?: unknown;
      statuses?: unknown;
    };
    const dataIni = asString(body.dataIni) ?? "";
    const dataFim = asString(body.dataFim) ?? "";
    const periodo = "1";
    const statusGroups = parseStatusGroups(body.statuses);

    if (!isInputDate(dataIni) || !isInputDate(dataFim)) {
      return NextResponse.json(
        { message: "Informe o período inicial e final." },
        { status: 400 }
      );
    }

    if (dataIni > dataFim) {
      return NextResponse.json(
        { message: "A data inicial não pode ser maior que a data final." },
        { status: 400 }
      );
    }

    if (statusGroups.length === 0) {
      return NextResponse.json(
        { message: "Selecione ao menos um status." },
        { status: 400 }
      );
    }

    const statusCodes = Array.from(
      new Set(statusGroups.flatMap((group) => GROUP_STATUS_CODES[group]))
    );
    const baseParams = {
      tipo: "1",
      periodo,
      data_ini: toBrDate(dataIni),
      data_fim: toBrDate(dataFim)
    };

    const resultByStatus = await Promise.all(
      statusCodes.map((status) => fetchContasByStatus(baseParams, status))
    );
    const contas = resultByStatus.flatMap((result) => result.contas);
    const faturas = sortInvoices(uniqueInvoices(contas.map(normalizeConta))).filter(
      (invoice) => statusGroups.includes(invoice.grupo)
    );

    return NextResponse.json({
      filtros: {
        dataIni,
        dataFim,
        periodo,
        statuses: statusGroups
      },
      limiteAtingido: resultByStatus.some((result) => result.limiteAtingido),
      resumo: summaryFromInvoices(faturas),
      faturas
    });
  } catch (error) {
    if (error instanceof RastroApiError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status >= 500 ? 502 : error.status }
      );
    }

    return NextResponse.json(
      { message: "Erro inesperado ao buscar cobranças." },
      { status: 500 }
    );
  }
}
