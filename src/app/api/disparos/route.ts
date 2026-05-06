import { NextResponse } from "next/server";
import { boletoParameterFromLink } from "../../../lib/boleto";
import {
  HelenaApiError,
  sendHelenaInvoiceTemplate
} from "../../../lib/helena";
import { asString } from "../../../lib/rastro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DispatchInvoiceInput = Record<string, unknown>;

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

function buildDispatchPayload(invoice: DispatchInvoiceInput) {
  const cliente =
    asString(invoice.clienteNome)?.trim() ||
    asString(invoice.clienteId)?.trim() ||
    "";
  const atraso = asString(invoice.vencimento)?.trim() ?? "";
  const boleto = boletoParameterFromLink(asString(invoice.linkBoleto));
  const to = normalizeBrazilPhone(asString(invoice.clienteTelefone));
  const missing: string[] = [];

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
    const body = (await request.json()) as { invoices?: unknown };

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
      const payload = buildDispatchPayload(record);

      if (!payload.ok) {
        falhas.push({
          ref,
          cliente,
          message: payload.message
        });
        continue;
      }

      try {
        const result = await sendHelenaInvoiceTemplate(payload.message);
        enviados.push({
          ref,
          cliente: payload.message.cliente,
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
              : "Falha ao enviar template Helena."
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
        { message: error.message, details: error.details },
        { status: error.status >= 500 ? 502 : error.status }
      );
    }

    return NextResponse.json(
      { message: "Erro inesperado ao enviar disparos." },
      { status: 500 }
    );
  }
}
