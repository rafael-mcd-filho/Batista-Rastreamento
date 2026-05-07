import { NextResponse } from "next/server";
import { cpfFromContact, getHelenaContact, HelenaApiError } from "../../../lib/helena";
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userid")?.trim();

    if (!userId) {
      return NextResponse.json(
        { message: "Informe o parâmetro userid na URL." },
        { status: 400 }
      );
    }

    const contato = await getHelenaContact(userId);
    const cpfCnpj = cpfFromContact(contato);
    const digits = cpfCnpjDigits(cpfCnpj ?? "");

    if (digits.length !== 11 && digits.length !== 14) {
      return NextResponse.json(
        { message: "O contato encontrado não possui CPF/CNPJ válido." },
        { status: 422 }
      );
    }

    const pessoa = await findPessoaByCpfCnpj(cpfCnpj ?? "");

    if (!pessoa) {
      return NextResponse.json(
        { message: "Nenhuma pessoa ativa encontrada para o CPF/CNPJ do contato." },
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
      origem: {
        tipo: "contato",
        userId,
        contato: {
          id: contato.id,
          nome: contato.name,
          telefone: contato.phoneNumberFormatted,
          email: contato.email
        }
      },
      pessoa: pessoaFinanceiraPayload(pessoa, cpfCnpj ?? ""),
      resumo: summaryFromContas(contas),
      faturas
    });
  } catch (error) {
    if (error instanceof HelenaApiError) {
      return NextResponse.json(
        { message: "Falha ao consultar contato." },
        { status: error.status >= 500 ? 502 : error.status }
      );
    }

    if (error instanceof RastroApiError) {
      return NextResponse.json(
        { message: error.message, details: error.details },
        { status: error.status >= 500 ? 502 : error.status }
      );
    }

    return NextResponse.json(
      { message: "Erro inesperado ao consultar contato e faturas." },
      { status: 500 }
    );
  }
}
