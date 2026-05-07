import { asString } from "./rastro";

const DEFAULT_MESSAGE_BASE_URL = "https://api.helena.run/chat/v1";
const DEFAULT_MESSAGE_FROM = "5583988098480";
const DEFAULT_TEMPLATE_ID = "9be1f_faturadiadovencimento";

export type HelenaContact = {
  id: string;
  name: string | null;
  phoneNumberFormatted: string | null;
  email: string | null;
  customFields: Record<string, unknown> | null;
};

export class HelenaApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "HelenaApiError";
    this.status = status;
    this.details = details;
  }
}

function getHelenaConfig() {
  const token = process.env.HELENA_API_TOKEN?.trim();
  const baseUrl = (
    process.env.HELENA_API_BASE_URL ?? "https://api.helena.run/core/v1"
  ).replace(/\/$/, "");

  if (!token) {
    throw new HelenaApiError(
      "Servico de contatos nao configurado no ambiente do servidor.",
      500,
      null
    );
  }

  return { token, baseUrl };
}

function getHelenaMessageConfig() {
  const token = process.env.HELENA_API_TOKEN?.trim();
  const baseUrl = (
    process.env.HELENA_CHAT_API_BASE_URL?.trim() || DEFAULT_MESSAGE_BASE_URL
  ).replace(/\/$/, "");
  const from = process.env.HELENA_MESSAGE_FROM?.trim() || DEFAULT_MESSAGE_FROM;
  const templateId =
    process.env.HELENA_TEMPLATE_ID?.trim() || DEFAULT_TEMPLATE_ID;

  if (!token) {
    throw new HelenaApiError(
      "Servico de mensagens nao configurado no ambiente do servidor.",
      500,
      null
    );
  }

  return { token, baseUrl, from, templateId };
}

export async function getHelenaContact(contactId: string): Promise<HelenaContact> {
  const { token, baseUrl } = getHelenaConfig();
  const url = new URL(`${baseUrl}/contact/${encodeURIComponent(contactId)}`);
  url.searchParams.set("IncludeDetails", "CustomFields");

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      Authorization: token
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

  if (!response.ok || !payload || typeof payload !== "object") {
    throw new HelenaApiError(
      `Falha ao consultar contato (${response.status}).`,
      response.status,
      payload
    );
  }

  const record = payload as Record<string, unknown>;

  return {
    id: asString(record.id) ?? contactId,
    name: asString(record.name ?? record.nameWhatsapp),
    phoneNumberFormatted: asString(record.phoneNumberFormatted),
    email: asString(record.email),
    customFields:
      record.customFields && typeof record.customFields === "object"
        ? (record.customFields as Record<string, unknown>)
        : null
  };
}

export function cpfFromContact(contact: HelenaContact) {
  const fields = contact.customFields;

  if (!fields) {
    return null;
  }

  return (
    asString(fields.cpf) ??
    asString(fields.CPF) ??
    asString(fields.cpf_cnpj) ??
    asString(fields.documento)
  );
}

export async function sendHelenaInvoiceTemplate({
  cliente,
  atraso,
  boleto,
  to,
  hiddenSession
}: {
  cliente: string;
  atraso: string;
  boleto: string;
  to: string;
  hiddenSession: boolean;
}) {
  const { token, baseUrl, from, templateId } = getHelenaMessageConfig();
  const payload = {
    body: {
      parameters: {
        Cliente: cliente,
        atraso,
        BOLETO: boleto
      },
      templateId
    },
    from,
    to,
    options: {
      hiddenSession
    }
  };

  const response = await fetch(`${baseUrl}/message/send`, {
    method: "POST",
    headers: {
      Authorization: token,
      accept: "application/json",
      "content-type": "application/*+json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  const text = await response.text();
  let result: unknown = text;

  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = { raw: text.slice(0, 1200) };
  }

  if (!response.ok) {
    throw new HelenaApiError(
      `Falha ao enviar mensagem (${response.status}).`,
      response.status,
      result
    );
  }

  return {
    status: response.status,
    result
  };
}
