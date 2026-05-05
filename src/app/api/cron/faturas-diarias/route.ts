import { NextResponse } from "next/server";
import {
  buildDailyInvoiceWebhookPayload,
  postDailyInvoiceWebhooks
} from "../../../../lib/faturas-diarias";
import { RastroApiError } from "../../../../lib/rastro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function runDailyInvoicesCron() {
  try {
    const payload = await buildDailyInvoiceWebhookPayload();
    const webhooks = await postDailyInvoiceWebhooks(payload);

    return NextResponse.json({
      ok: true,
      webhooks,
      resumo: payload.resumo,
      filtros: payload.filtros
    });
  } catch (error) {
    if (error instanceof RastroApiError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status >= 500 ? 502 : error.status }
      );
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao executar o cron de faturas."
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return runDailyInvoicesCron();
}

export async function POST() {
  return runDailyInvoicesCron();
}
