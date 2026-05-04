import { asString } from "./rastro";

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
      "HELENA_API_TOKEN não configurado no ambiente do servidor.",
      500,
      null
    );
  }

  return { token, baseUrl };
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
      `Falha na API Helena (${response.status}).`,
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
