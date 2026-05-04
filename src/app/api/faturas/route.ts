import { NextResponse } from "next/server";
import {
  asString,
  cpfCnpjDigits,
  dataArray,
  financeiroPorPessoaId,
  findPessoaByCpfCnpj,
  normalizeConta,
  pessoaFinanceiraPayload,
  RastroApiError,
  sortInvoices,
  summaryFromContas
} from "../../../lib/rastro";

export const dynamic = "force-dynamic";

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

    const pessoa = await findPessoaByCpfCnpj(cpfCnpj);

    if (!pessoa) {
      return NextResponse.json(
        { message: "Nenhuma pessoa ativa encontrada para esse documento." },
        { status: 404 }
      );
    }

    const pessoaId = asString(pessoa.id);

    if (!pessoaId) {
      return NextResponse.json(
        { message: "A pessoa encontrada não possui ID no retorno da API." },
        { status: 422 }
      );
    }

    const financeiro = await financeiroPorPessoaId(pessoaId);
    const contas = dataArray(financeiro);
    const faturas = sortInvoices(contas.map(normalizeConta));

    return NextResponse.json({
      pessoa: pessoaFinanceiraPayload(pessoa, cpfCnpj),
      resumo: summaryFromContas(contas),
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
      { message: "Erro inesperado ao consultar faturas." },
      { status: 500 }
    );
  }
}
