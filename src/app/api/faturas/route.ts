import { NextResponse } from "next/server";
import {
  apiGet,
  asString,
  cpfCnpjDigits,
  dataArray,
  formatCpfCnpj,
  normalizeConta,
  RastroApiError,
  sortInvoices,
  summaryFromContas
} from "../../../lib/rastro";

export const dynamic = "force-dynamic";

async function findPessoa(cpfCnpj: string) {
  const formatted = formatCpfCnpj(cpfCnpj);
  const digits = cpfCnpjDigits(cpfCnpj);
  const attempts: Array<Record<string, string>> = [
    { cpf_cnpj: formatted, st: "ativo", page: "0", limit: "10" },
    { cpf_cnpj: formatted, status: "2", page: "0", limit: "10" },
    { cpf_cnpj: digits, st: "ativo", page: "0", limit: "10" }
  ];

  for (const params of attempts) {
    const payload = await apiGet("list-pessoas", params);
    const pessoas = dataArray(payload);

    if (pessoas.length > 0) {
      return { pessoa: pessoas[0] };
    }
  }

  return { pessoa: null };
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
        { message: "Nenhuma pessoa ativa encontrada para esse documento." },
        { status: 404 }
      );
    }

    const pessoaId = asString(pessoaResult.pessoa.id);

    if (!pessoaId) {
      return NextResponse.json(
        { message: "A pessoa encontrada não possui ID no retorno da API." },
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
    const faturas = sortInvoices(contas.map(normalizeConta));

    return NextResponse.json({
      pessoa: {
        id: pessoaId,
        nome: asString(pessoaResult.pessoa.nome_razao_social),
        cpfCnpj: asString(pessoaResult.pessoa.cpf_cnpj) ?? formatCpfCnpj(cpfCnpj),
        telefone: asString(pessoaResult.pessoa.fone),
        email: asString(pessoaResult.pessoa.email)
      },
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
