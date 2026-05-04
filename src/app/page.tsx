"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileJson,
  ReceiptText,
  Search,
  WalletCards
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type InvoiceGroup = "overdue" | "open" | "paid" | "other";
type Filter = "all" | InvoiceGroup;

type Invoice = {
  id: string | null;
  parcela: string | null;
  valor: number | null;
  valorOriginal: string | null;
  valorPago: number | null;
  valorPagoOriginal: string | null;
  vencimento: string | null;
  pagamento: string | null;
  statusCodigo: string;
  statusLabel: string;
  grupo: InvoiceGroup;
  linkBoleto: string | null;
  formaPagamento: string | null;
  qrcode: string | null;
  linhaDigitavel: string | null;
};

type SearchResult = {
  pessoa: {
    id: string;
    nome: string | null;
    cpfCnpj: string | null;
    telefone: string | null;
    email: string | null;
  };
  resumo: {
    valorTotalContas: number | null;
    valorVencidas: number | null;
    valorAbertas: number | null;
    valorPagas: number | null;
    countTotalContas: number;
    countVencidas: number;
    countAbertas: number;
    countPagas: number;
    countOutras: number;
  };
  faturas: Invoice[];
  raw: unknown;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const groupMeta: Record<
  InvoiceGroup,
  { label: string; className: string; icon: typeof AlertTriangle }
> = {
  overdue: { label: "Vencida", className: "statusOverdue", icon: AlertTriangle },
  open: { label: "Aberta", className: "statusOpen", icon: Clock3 },
  paid: { label: "Paga", className: "statusPaid", icon: CheckCircle2 },
  other: { label: "Outro", className: "statusOther", icon: ReceiptText }
};

function money(value: number | null, original?: string | null) {
  if (typeof value === "number") {
    return currency.format(value);
  }

  return original || "-";
}

function maskDocument(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

function countLabel(count: number) {
  return count === 1 ? "1 fatura" : `${count} faturas`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function copyText(value: string | null) {
  if (!value) {
    return;
  }

  void navigator.clipboard.writeText(value);
}

function StatusBadge({ invoice }: { invoice: Invoice }) {
  const meta = groupMeta[invoice.grupo];
  const Icon = meta.icon;

  return (
    <span className={`statusBadge ${meta.className}`}>
      <Icon size={14} aria-hidden="true" />
      {invoice.statusLabel || meta.label}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
  tone
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof ReceiptText;
  tone: string;
}) {
  return (
    <article className={`summaryCard ${tone}`}>
      <div className="summaryIcon">
        <Icon size={20} aria-hidden="true" />
      </div>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function InvoiceActions({ invoice }: { invoice: Invoice }) {
  return (
    <div className="invoiceActions">
      {invoice.linkBoleto ? (
        <a
          className="iconButton"
          href={invoice.linkBoleto}
          target="_blank"
          rel="noreferrer"
          title="Abrir boleto"
          aria-label="Abrir boleto"
        >
          <ExternalLink size={17} aria-hidden="true" />
        </a>
      ) : null}
      {invoice.linhaDigitavel ? (
        <button
          className="iconButton"
          type="button"
          onClick={() => copyText(invoice.linhaDigitavel)}
          title="Copiar linha digitável"
          aria-label="Copiar linha digitável"
        >
          <Copy size={17} aria-hidden="true" />
        </button>
      ) : null}
      {invoice.qrcode ? (
        <button
          className="iconButton"
          type="button"
          onClick={() => copyText(invoice.qrcode)}
          title="Copiar QR Code"
          aria-label="Copiar QR Code"
        >
          <FileJson size={17} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [documento, setDocumento] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTabAnimating, setIsTabAnimating] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const filteredInvoices = useMemo(() => {
    if (!result) {
      return [];
    }

    if (filter === "all") {
      return result.faturas;
    }

    return result.faturas.filter((invoice) => invoice.grupo === filter);
  }, [filter, result]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const loadingStart = Date.now();
    setIsLoading(true);
    setError("");
    setResult(null);
    setShowRaw(false);

    try {
      const response = await fetch("/api/faturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpfCnpj: documento })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Falha ao consultar a API.");
      }

      setResult(payload);
      setFilter("all");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao consultar a API.");
    } finally {
      const elapsed = Date.now() - loadingStart;
      await wait(Math.max(0, 4000 - elapsed));
      setIsLoading(false);
    }
  }

  function handleFilterChange(nextFilter: Filter) {
    if (nextFilter === filter) {
      return;
    }

    setIsTabAnimating(true);
    setFilter(nextFilter);
    window.setTimeout(() => setIsTabAnimating(false), 260);
  }

  const filterOptions = result
    ? [
        { key: "all" as const, label: "Todas", count: result.faturas.length },
        { key: "overdue" as const, label: "Vencidas", count: result.resumo.countVencidas },
        { key: "open" as const, label: "Abertas", count: result.resumo.countAbertas },
        { key: "paid" as const, label: "Pagas", count: result.resumo.countPagas },
        { key: "other" as const, label: "Outras", count: result.resumo.countOutras }
      ]
    : [];

  return (
    <main className="appShell">
      {isLoading ? (
        <div className="loadingToast" role="status" aria-live="polite">
          <span className="loadingSpinner" aria-hidden="true" />
          <strong>Puxando dados</strong>
          <span>Consultando pessoa, faturas e status financeiro...</span>
          <i aria-hidden="true" />
        </div>
      ) : null}

      <section className="workspace">
        <header className="topBar">
          <div>
            <span className="eyebrow">Batista Rastreamento</span>
            <h1>Painel financeiro</h1>
          </div>
          <form className="searchPanel" onSubmit={onSubmit}>
            <label htmlFor="documento">CPF ou CNPJ</label>
            <div className="searchControl">
              <input
                id="documento"
                value={documento}
                onChange={(event) => setDocumento(maskDocument(event.target.value))}
                inputMode="numeric"
                placeholder="000.000.000-00"
                autoComplete="off"
              />
              <button type="submit" disabled={isLoading}>
                <Search size={18} aria-hidden="true" />
                {isLoading ? "Consultando" : "Consultar"}
              </button>
            </div>
          </form>
        </header>

        {error ? (
          <div className="notice errorNotice" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {!result && !error && !isLoading ? (
          <div className="emptyState">
            <ReceiptText size={42} aria-hidden="true" />
            <strong>Nenhuma consulta carregada</strong>
          </div>
        ) : null}

        {result ? (
          <>
            <section className="customerBand">
              <div>
                <span>Cliente</span>
                <strong>{result.pessoa.nome || "Sem nome no retorno"}</strong>
              </div>
              <div>
                <span>Documento</span>
                <strong>{result.pessoa.cpfCnpj || documento}</strong>
              </div>
              <div>
                <span>ID</span>
                <strong>{result.pessoa.id}</strong>
              </div>
              <div>
                <span>Contato</span>
                <strong>{result.pessoa.telefone || result.pessoa.email || "-"}</strong>
              </div>
            </section>

            <section className="summaryGrid" aria-label="Resumo financeiro">
              <SummaryCard
                title="Total"
                value={money(result.resumo.valorTotalContas)}
                detail={countLabel(result.resumo.countTotalContas)}
                icon={WalletCards}
                tone="toneTotal"
              />
              <SummaryCard
                title="Vencidas"
                value={money(result.resumo.valorVencidas)}
                detail={countLabel(result.resumo.countVencidas)}
                icon={AlertTriangle}
                tone="toneOverdue"
              />
              <SummaryCard
                title="Abertas"
                value={money(result.resumo.valorAbertas)}
                detail={countLabel(result.resumo.countAbertas)}
                icon={Clock3}
                tone="toneOpen"
              />
              <SummaryCard
                title="Pagas"
                value={money(result.resumo.valorPagas)}
                detail={countLabel(result.resumo.countPagas)}
                icon={CheckCircle2}
                tone="tonePaid"
              />
            </section>

            <section className="invoiceSection">
              <div className="sectionHeader">
                <div>
                  <span>Faturas</span>
                  <strong>{countLabel(filteredInvoices.length)}</strong>
                </div>
                <div className="filterTabs" aria-label="Filtros de status">
                  {filterOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={filter === option.key ? "active" : ""}
                      onClick={() => handleFilterChange(option.key)}
                    >
                      {option.label}
                      <span>{option.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`invoiceContent ${isTabAnimating ? "isSwitching" : ""}`}>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Parcela</th>
                        <th>Status</th>
                        <th>Vencimento</th>
                        <th>Pagamento</th>
                        <th>Valor</th>
                        <th>Pago</th>
                        <th>Forma</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice, index) => (
                        <tr key={`${invoice.id ?? "sem-id"}-${index}`}>
                          <td>{invoice.parcela || invoice.id || "-"}</td>
                          <td>
                            <StatusBadge invoice={invoice} />
                          </td>
                          <td>{invoice.vencimento || "-"}</td>
                          <td>{invoice.pagamento || "-"}</td>
                          <td>{money(invoice.valor, invoice.valorOriginal)}</td>
                          <td>{money(invoice.valorPago, invoice.valorPagoOriginal)}</td>
                          <td>{invoice.formaPagamento || "-"}</td>
                          <td>
                            <InvoiceActions invoice={invoice} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobileInvoices">
                  {filteredInvoices.map((invoice, index) => (
                    <article className="invoiceCard" key={`${invoice.id ?? "sem-id-mobile"}-${index}`}>
                      <div className="invoiceCardTop">
                        <strong>{invoice.parcela || invoice.id || "Fatura"}</strong>
                        <StatusBadge invoice={invoice} />
                      </div>
                      <dl>
                        <div>
                          <dt>Vencimento</dt>
                          <dd>{invoice.vencimento || "-"}</dd>
                        </div>
                        <div>
                          <dt>Pagamento</dt>
                          <dd>{invoice.pagamento || "-"}</dd>
                        </div>
                        <div>
                          <dt>Valor</dt>
                          <dd>{money(invoice.valor, invoice.valorOriginal)}</dd>
                        </div>
                        <div>
                          <dt>Pago</dt>
                          <dd>{money(invoice.valorPago, invoice.valorPagoOriginal)}</dd>
                        </div>
                        <div>
                          <dt>Forma</dt>
                          <dd>{invoice.formaPagamento || "-"}</dd>
                        </div>
                      </dl>
                      <InvoiceActions invoice={invoice} />
                    </article>
                  ))}
                </div>

                {filteredInvoices.length === 0 ? (
                  <div className="notice">
                    <ReceiptText size={18} aria-hidden="true" />
                    <span>Nenhuma fatura neste filtro.</span>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rawSection">
              <button type="button" onClick={() => setShowRaw((value) => !value)}>
                <FileJson size={17} aria-hidden="true" />
                Dados brutos
              </button>
              {showRaw ? <pre>{JSON.stringify(result.raw, null, 2)}</pre> : null}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
