import { NextResponse } from "next/server";
import { boletoParameterFromLink } from "../../../lib/boleto";
import {
  HelenaApiError,
  sendHelenaInvoiceTemplate,
  sendHelenaRenewalTemplate
} from "../../../lib/helena";
import { asString } from "../../../lib/rastro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DispatchInvoiceInput = Record<string, unknown>;
type DispatchTemplate = "invoice" | "renovacao";

type BuiltDispatchPayload =
  | {
      ok: false;
      message: string;
    }
  | {
      ok: true;
      template: "invoice";
      message: {
        cliente: string;
        atraso: string;
        boleto: string;
        to: string;
      };
    }
  | {
      ok: true;
      template: "renovacao";
      message: {
        nomeCliente: string;
        to: string;
      };
    };

function dispatchTemplateFrom(value: unknown): DispatchTemplate {
  return value === "renovacao" ? "renovacao" : "invoice";
}

function firstContactName(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  const firstName = normalized?.split(" ")[0]?.toLocaleLowerCase("pt-BR");

  if (!firstName) {
    return null;
  }

  const [firstLetter, ...rest] = Array.from(firstName);

  if (!firstLetter) {
    return null;
  }

  return `${firstLetter.toLocaleUpperCase("pt-BR")}${rest.join("")}`;
}

function normalizeBrazilPhone(value: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  if (/^55\d{10,11}$/.test(digits)) {
    return digits;
  }

  if (/^\d{10,11}$/.test(digits)) {
    return `55${digits}`;
  }

  return null;
}

function invoiceRef(invoice: DispatchInvoiceInput, index: number) {
  return (
    asString(invoice.id) ??
    asString(invoice.parcela) ??
    asString(invoice.clienteId) ??
    String(index + 1)
  );
}

function buildDispatchPayload(
  invoice: DispatchInvoiceInput,
  template: DispatchTemplate
): BuiltDispatchPayload {
  const to = normalizeBrazilPhone(asString(invoice.clienteTelefone));
  const missing: string[] = [];

  if (template === "renovacao") {
    const nomeCliente = firstContactName(asString(invoice.clienteNome));

    if (!nomeCliente) {
      missing.push("nome do cliente");
    }

    if (!to) {
      missing.push("telefone");
    }

    if (missing.length > 0 || !nomeCliente || !to) {
      return {
        ok: false,
        message: `Dados incompletos: ${missing.join(", ")}.`
      };
    }

    return {
      ok: true,
      template,
      message: {
        nomeCliente,
        to
      }
    };
  }

  const cliente =
    firstContactName(asString(invoice.clienteNome)) ||
    firstContactName(asString(invoice.clienteId)) ||
    "";
  const atraso = asString(invoice.vencimento)?.trim() ?? "";
  const boleto = boletoParameterFromLink(asString(invoice.linkBoleto));

  if (!cliente) {
    missing.push("cliente");
  }

  if (!atraso) {
    missing.push("vencimento");
  }

  if (!boleto) {
    missing.push("boleto");
  }

  if (!to) {
    missing.push("telefone");
  }

  if (missing.length > 0 || !boleto || !to) {
    return {
      ok: false as const,
      message: `Dados incompletos: ${missing.join(", ")}.`
    };
  }

  return {
    ok: true as const,
    template,
    message: {
      cliente,
      atraso,
      boleto,
      to
    }
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      invoices?: unknown;
      hiddenSession?: unknown;
      template?: unknown;
    };
    const hiddenSession =
      typeof body.hiddenSession === "boolean" ? body.hiddenSession : true;
    const template = dispatchTemplateFrom(body.template);

    if (!Array.isArray(body.invoices) || body.invoices.length === 0) {
      return NextResponse.json(
        { message: "Selecione ao menos uma fatura para disparo." },
        { status: 400 }
      );
    }

    const enviados: Array<{
      ref: string;
      cliente: string;
      to: string;
      status: number;
    }> = [];
    const falhas: Array<{ ref: string; cliente: string | null; message: string }> = [];

    for (const [index, invoice] of body.invoices.entries()) {
      if (!invoice || typeof invoice !== "object" || Array.isArray(invoice)) {
        falhas.push({
          ref: String(index + 1),
          cliente: null,
          message: "Registro de fatura invalido."
        });
        continue;
      }

      const record = invoice as DispatchInvoiceInput;
      const ref = invoiceRef(record, index);
      const cliente = asString(record.clienteNome) ?? asString(record.clienteId);
      const payload = buildDispatchPayload(record, template);

      if (!payload.ok) {
        falhas.push({
          ref,
          cliente,
          message: payload.message
        });
        continue;
      }

      try {
        const result =
          payload.template === "renovacao"
            ? await sendHelenaRenewalTemplate({
                ...payload.message,
                hiddenSession
              })
            : await sendHelenaInvoiceTemplate({
                ...payload.message,
                hiddenSession
        });
        enviados.push({
          ref,
          cliente: cliente || ref,
          to: payload.message.to,
          status: result.status
        });
      } catch (error) {
        falhas.push({
          ref,
          cliente,
          message:
            error instanceof Error
              ? error.message
              : "Falha ao enviar mensagem."
        });
      }
    }

    const status =
      falhas.length === 0 ? 200 : enviados.length > 0 ? 207 : 422;

    return NextResponse.json(
      {
        ok: falhas.length === 0,
        enviados: enviados.length,
        falhas: falhas.length,
        resultados: {
          enviados,
          falhas
        }
      },
      { status }
    );
  } catch (error) {
    if (error instanceof HelenaApiError) {
      return NextResponse.json(
        { message: "Falha ao enviar mensagem." },
        { status: error.status >= 500 ? 502 : error.status }
      );
    }

    return NextResponse.json(
      { message: "Erro inesperado ao enviar disparos." },
      { status: 500 }
    );
  }
}
