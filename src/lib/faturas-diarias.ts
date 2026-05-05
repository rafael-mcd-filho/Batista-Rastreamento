import {
  apiGet,
  dataArray,
  GROUP_STATUS_CODES,
  normalizeConta,
  sortInvoices,
  toBrDate,
  uniqueInvoices
} from "./rastro";
import type { InvoiceGroup, NormalizedInvoice, RawRecord } from "./rastro";

const DEFAULT_TIME_ZONE = "America/Fortaleza";
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 500;
const MAX_PAGES = 20;

type DispatchType = "vence_hoje" | "vencida_5_dias";

type DispatchInvoice = NormalizedInvoice & {
  tipoDisparo: DispatchType;
  diasAtraso: number;
};

type WebhookEvent = "faturas_vencem_hoje" | "faturas_vencidas_5_dias";

type DailyInvoiceWebhookPostPayload = {
  evento: WebhookEvent;
  geradoEm: string;
  timezone: string;
  data: string;
  diasAtraso: number;
  filtros: {
    statuses: InvoiceGroup[];
  };
  resumo: {
    total: number;
    limiteAtingido: boolean;
  };
  faturas: DispatchInvoice[];
};

export type DailyInvoiceWebhookPayload = {
  evento: "faturas_diarias";
  geradoEm: string;
  timezone: string;
  hoje: string;
  cincoDiasAtras: string;
  filtros: {
    vencemHoje: {
      data: string;
      statuses: InvoiceGroup[];
    };
    vencidasCincoDias: {
      data: string;
      statuses: InvoiceGroup[];
      diasAtraso: 5;
    };
  };
  resumo: {
    total: number;
    vencemHoje: number;
    vencidasCincoDias: number;
    limiteAtingido: boolean;
    limiteAtingidoVencemHoje: boolean;
    limiteAtingidoVencidasCincoDias: boolean;
  };
  vencemHoje: DispatchInvoice[];
  vencidasCincoDias: DispatchInvoice[];
  faturas: DispatchInvoice[];
};

export type DailyWebhookResult = {
  destino: "vencem_hoje" | "vencidas_5_dias";
  envName: string;
  total: number;
  skipped: boolean;
  status: number | null;
  responseText: string | null;
};

type FetchInvoicesResult = {
  invoices: NormalizedInvoice[];
  limitReached: boolean;
};

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function currentIsoDateInTimeZone(timeZone: string, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function addDaysIso(value: string, amount: number) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return value;
  }

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) +
      amount * DAY_MS
  );

  return date.toISOString().slice(0, 10);
}

async function fetchContasByDateAndStatus(date: string, status: string) {
  const contas: RawRecord[] = [];
  let limitReached = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await apiGet("get-financeiro-v2", {
      tipo: "1",
      periodo: "1",
      data_ini: toBrDate(date),
      data_fim: toBrDate(date),
      status,
      page: String(page),
      limit: String(PAGE_LIMIT)
    });
    const pageContas = dataArray(payload);

    contas.push(...pageContas);

    if (pageContas.length < PAGE_LIMIT) {
      return { contas, limitReached: false };
    }

    limitReached = true;
  }

  return { contas, limitReached };
}

async function fetchInvoicesByDateAndGroups(
  date: string,
  groups: InvoiceGroup[]
): Promise<FetchInvoicesResult> {
  const statusCodes = Array.from(
    new Set(groups.flatMap((group) => GROUP_STATUS_CODES[group]))
  );
  const results = await Promise.all(
    statusCodes.map((status) => fetchContasByDateAndStatus(date, status))
  );
  const contas = results.flatMap((result) => result.contas);
  const invoices = sortInvoices(uniqueInvoices(contas.map(normalizeConta)));

  return {
    invoices,
    limitReached: results.some((result) => result.limitReached)
  };
}

function withDispatchType(
  invoices: NormalizedInvoice[],
  tipoDisparo: DispatchType,
  diasAtraso: number
): DispatchInvoice[] {
  return invoices.map((invoice) => ({
    ...invoice,
    tipoDisparo,
    diasAtraso
  }));
}

export async function buildDailyInvoiceWebhookPayload(
  date = new Date()
): Promise<DailyInvoiceWebhookPayload> {
  const timezone = envValue("FATURAS_CRON_TIMEZONE") ?? DEFAULT_TIME_ZONE;
  const hoje = currentIsoDateInTimeZone(timezone, date);
  const cincoDiasAtras = addDaysIso(hoje, -5);

  const dueTodayGroups: InvoiceGroup[] = ["open", "overdue"];
  const overdueGroups: InvoiceGroup[] = ["overdue"];
  const [dueTodayResult, overdueFiveDaysResult] = await Promise.all([
    fetchInvoicesByDateAndGroups(hoje, dueTodayGroups),
    fetchInvoicesByDateAndGroups(cincoDiasAtras, overdueGroups)
  ]);

  const vencemHoje = withDispatchType(
    dueTodayResult.invoices.filter(
      (invoice) =>
        invoice.vencimentoSort === hoje &&
        (invoice.grupo === "open" || invoice.grupo === "overdue")
    ),
    "vence_hoje",
    0
  );
  const vencidasCincoDias = withDispatchType(
    overdueFiveDaysResult.invoices.filter(
      (invoice) =>
        invoice.vencimentoSort === cincoDiasAtras && invoice.grupo === "overdue"
    ),
    "vencida_5_dias",
    5
  );
  const faturas = [...vencemHoje, ...vencidasCincoDias];
  const limiteAtingido =
    dueTodayResult.limitReached || overdueFiveDaysResult.limitReached;

  return {
    evento: "faturas_diarias",
    geradoEm: date.toISOString(),
    timezone,
    hoje,
    cincoDiasAtras,
    filtros: {
      vencemHoje: {
        data: hoje,
        statuses: dueTodayGroups
      },
      vencidasCincoDias: {
        data: cincoDiasAtras,
        statuses: overdueGroups,
        diasAtraso: 5
      }
    },
    resumo: {
      total: faturas.length,
      vencemHoje: vencemHoje.length,
      vencidasCincoDias: vencidasCincoDias.length,
      limiteAtingido,
      limiteAtingidoVencemHoje: dueTodayResult.limitReached,
      limiteAtingidoVencidasCincoDias: overdueFiveDaysResult.limitReached
    },
    vencemHoje,
    vencidasCincoDias,
    faturas
  };
}

function dueTodayWebhookPayload(
  payload: DailyInvoiceWebhookPayload
): DailyInvoiceWebhookPostPayload {
  return {
    evento: "faturas_vencem_hoje",
    geradoEm: payload.geradoEm,
    timezone: payload.timezone,
    data: payload.hoje,
    diasAtraso: 0,
    filtros: {
      statuses: payload.filtros.vencemHoje.statuses
    },
    resumo: {
      total: payload.vencemHoje.length,
      limiteAtingido: payload.resumo.limiteAtingidoVencemHoje
    },
    faturas: payload.vencemHoje
  };
}

function overdueFiveDaysWebhookPayload(
  payload: DailyInvoiceWebhookPayload
): DailyInvoiceWebhookPostPayload {
  return {
    evento: "faturas_vencidas_5_dias",
    geradoEm: payload.geradoEm,
    timezone: payload.timezone,
    data: payload.cincoDiasAtras,
    diasAtraso: 5,
    filtros: {
      statuses: payload.filtros.vencidasCincoDias.statuses
    },
    resumo: {
      total: payload.vencidasCincoDias.length,
      limiteAtingido: payload.resumo.limiteAtingidoVencidasCincoDias
    },
    faturas: payload.vencidasCincoDias
  };
}

async function postWebhook(
  url: string,
  payload: DailyInvoiceWebhookPostPayload
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Webhook ${payload.evento} retornou status ${response.status}: ${responseText.slice(0, 500)}`
    );
  }

  return {
    status: response.status,
    responseText: responseText.slice(0, 500)
  };
}

async function postWebhookTarget({
  destino,
  envName,
  payload
}: {
  destino: DailyWebhookResult["destino"];
  envName: string;
  payload: DailyInvoiceWebhookPostPayload;
}): Promise<DailyWebhookResult> {
  const shouldSendEmpty = envValue("FATURAS_WEBHOOK_SEND_EMPTY") === "true";

  if (!shouldSendEmpty && payload.faturas.length === 0) {
    return {
      destino,
      envName,
      total: payload.faturas.length,
      skipped: true,
      status: null,
      responseText: null
    };
  }

  const url = envValue(envName);

  if (!url) {
    throw new Error(`${envName} nao configurado no ambiente.`);
  }

  const result = await postWebhook(url, payload);

  return {
    destino,
    envName,
    total: payload.faturas.length,
    skipped: false,
    status: result.status,
    responseText: result.responseText
  };
}

export async function postDailyInvoiceWebhooks(
  payload: DailyInvoiceWebhookPayload
): Promise<DailyWebhookResult[]> {
  const [dueTodayResult, overdueFiveDaysResult] = await Promise.all([
    postWebhookTarget({
      destino: "vencem_hoje",
      envName: "FATURAS_WEBHOOK_VENCEM_HOJE_URL",
      payload: dueTodayWebhookPayload(payload)
    }),
    postWebhookTarget({
      destino: "vencidas_5_dias",
      envName: "FATURAS_WEBHOOK_VENCIDAS_5_DIAS_URL",
      payload: overdueFiveDaysWebhookPayload(payload)
    })
  ]);

  return [dueTodayResult, overdueFiveDaysResult];
}
