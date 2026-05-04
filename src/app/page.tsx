"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileJson,
  RefreshCcw,
  ReceiptText,
  Search,
  WalletCards
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type InvoiceGroup = "overdue" | "open" | "paid" | "other";
type Filter = "all" | InvoiceGroup;
type MainTab = "client" | "invoices";
type PageSize = 25 | 50 | 100;
type SortKey = "cliente" | "vencimento" | "pagamento" | "valor" | "status";
type SortDirection = "asc" | "desc";
type RangePreset =
  | "today"
  | "yesterday"
  | "currentWeek"
  | "previousWeek"
  | "currentMonth"
  | "previousMonth"
  | "custom";

type Invoice = {
  id: string | null;
  parcela: string | null;
  descricao: string | null;
  clienteId: string | null;
  clienteNome: string | null;
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
  pessoa?: {
    id: string;
    nome: string | null;
    cpfCnpj: string | null;
    telefone: string | null;
    email: string | null;
  };
  filtros?: {
    dataIni: string;
    dataFim: string;
    statuses: InvoiceGroup[];
  };
  limiteAtingido?: boolean;
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
  other: { label: "Outra", className: "statusOther", icon: ReceiptText }
};

const statusChoices: Array<{ key: InvoiceGroup; label: string }> = [
  { key: "paid", label: "Paga" },
  { key: "overdue", label: "Vencida" },
  { key: "open", label: "Em aberto" },
  { key: "other", label: "Outras" }
];

const pageSizeOptions: PageSize[] = [25, 50, 100];
const rangePresetOptions: Array<{ key: RangePreset; label: string }> = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "currentWeek", label: "Semana atual" },
  { key: "previousWeek", label: "Semana anterior" },
  { key: "currentMonth", label: "Mês atual" },
  { key: "previousMonth", label: "Mês anterior" },
  { key: "custom", label: "Período personalizado" }
];
const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric"
});
const settingsStorageKey = "batista-financeiro-filtros";

function money(value: number | null, original?: string | null) {
  if (typeof value === "number") {
    return currency.format(value);
  }

  return original || "-";
}

function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function inputDate(date: Date) {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

function parseInputDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date();
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function monthStartDate() {
  const date = new Date();
  return inputDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

function monthEndDate() {
  const date = new Date();
  return inputDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function displayInputDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function parseDisplayDate(value: string | null) {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function overdueDays(invoice: Invoice) {
  if (invoice.grupo !== "overdue") {
    return null;
  }

  const dueDate = parseDisplayDate(invoice.vencimento);
  if (!dueDate) {
    return null;
  }

  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = startToday.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function rangeLabel(dataIni: string, dataFim: string) {
  return `${displayInputDate(dataIni)} até ${displayInputDate(dataFim)}`;
}

function presetRange(preset: RangePreset) {
  const today = new Date();

  if (preset === "today") {
    return { start: inputDate(today), end: inputDate(today) };
  }

  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return { start: inputDate(yesterday), end: inputDate(yesterday) };
  }

  if (preset === "currentWeek") {
    return { start: inputDate(startOfWeek(today)), end: inputDate(endOfWeek(today)) };
  }

  if (preset === "previousWeek") {
    const previousWeek = addDays(today, -7);
    return {
      start: inputDate(startOfWeek(previousWeek)),
      end: inputDate(endOfWeek(previousWeek))
    };
  }

  if (preset === "previousMonth") {
    return {
      start: inputDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      end: inputDate(new Date(today.getFullYear(), today.getMonth(), 0))
    };
  }

  return {
    start: inputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: inputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  };
}

function calendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const calendarStart = addDays(firstDay, -firstWeekday);

  return Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));
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

function overdueLabel(days: number | null) {
  if (days === null) {
    return null;
  }

  if (days === 0) {
    return "Vence hoje";
  }

  return days === 1 ? "1 dia em atraso" : `${days} dias em atraso`;
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, invoices: Invoice[]) {
  const headers = [
    "Cliente",
    "Parcela",
    "Status",
    "Vencimento",
    "Pagamento",
    "Valor",
    "Valor pago",
    "Forma",
    "Linha digitavel",
    "Link boleto"
  ];
  const rows = invoices.map((invoice) => [
    invoice.clienteNome ?? "",
    invoice.parcela ?? invoice.id ?? "",
    invoice.statusLabel,
    invoice.vencimento ?? "",
    invoice.pagamento ?? "",
    invoice.valor ?? invoice.valorOriginal ?? "",
    invoice.valorPago ?? invoice.valorPagoOriginal ?? "",
    invoice.formaPagamento ?? "",
    invoice.linhaDigitavel ?? "",
    invoice.linkBoleto ?? ""
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(";"))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function copyText(value: string | null) {
  if (!value) {
    return false;
  }

  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fallback below handles browsers that reject the async Clipboard API.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
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

function InvoiceStatus({ invoice }: { invoice: Invoice }) {
  const label = overdueLabel(overdueDays(invoice));

  return (
    <div className="statusStack">
      <StatusBadge invoice={invoice} />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
  tone,
  onClick
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof ReceiptText;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <button className={`summaryCard ${tone}`} type="button" onClick={onClick}>
      <div className="summaryIcon">
        <Icon size={20} aria-hidden="true" />
      </div>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </button>
  );
}

function InvoiceActions({
  invoice,
  onCopy,
  onOpenBoleto,
  onDetails
}: {
  invoice: Invoice;
  onCopy: (value: string | null, successMessage: string) => void;
  onOpenBoleto: (value: string | null) => void;
  onDetails: (invoice: Invoice) => void;
}) {
  return (
    <div className="invoiceActions">
      <button
        className="iconButton"
        type="button"
        onClick={() => onDetails(invoice)}
        title="Ver detalhes"
        aria-label="Ver detalhes"
      >
        <Eye size={17} aria-hidden="true" />
      </button>
      {invoice.linkBoleto ? (
        <button
          className="iconButton"
          type="button"
          onClick={() => onOpenBoleto(invoice.linkBoleto)}
          title="Abrir boleto"
          aria-label="Abrir boleto"
        >
          <ExternalLink size={17} aria-hidden="true" />
        </button>
      ) : null}
      {invoice.linhaDigitavel ? (
        <button
          className="iconButton"
          type="button"
          onClick={() => onCopy(invoice.linhaDigitavel, "Linha digitável copiada")}
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
          onClick={() => onCopy(invoice.qrcode, "QR Code copiado")}
          title="Copiar QR Code"
          aria-label="Copiar QR Code"
        >
          <FileJson size={17} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  sortFor,
  activeSort,
  direction,
  onSort
}: {
  label: string;
  sortFor: SortKey;
  activeSort: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeSort === sortFor;

  return (
    <button className={`sortButton ${isActive ? "active" : ""}`} type="button" onClick={() => onSort(sortFor)}>
      {label}
      <ChevronDown
        size={14}
        aria-hidden="true"
        className={isActive && direction === "desc" ? "desc" : ""}
      />
    </button>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<MainTab>("client");
  const [documento, setDocumento] = useState("");
  const [dataIni, setDataIni] = useState(monthStartDate);
  const [dataFim, setDataFim] = useState(monthEndDate);
  const [rangePreset, setRangePreset] = useState<RangePreset>("currentMonth");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => parseInputDate(monthStartDate()));
  const [rangeDraftStart, setRangeDraftStart] = useState<string | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<InvoiceGroup[]>([
    "paid",
    "overdue",
    "open",
    "other"
  ]);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [nameSearch, setNameSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [sortKey, setSortKey] = useState<SortKey>("vencimento");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(settingsStorageKey);

    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as {
        dataIni?: string;
        dataFim?: string;
        rangePreset?: RangePreset;
        selectedStatuses?: InvoiceGroup[];
      };

      if (parsed.dataIni) {
        setDataIni(parsed.dataIni);
        setCalendarMonth(parseInputDate(parsed.dataIni));
      }

      if (parsed.dataFim) {
        setDataFim(parsed.dataFim);
      }

      if (
        parsed.rangePreset &&
        rangePresetOptions.some((option) => option.key === parsed.rangePreset)
      ) {
        setRangePreset(parsed.rangePreset);
      }

      if (Array.isArray(parsed.selectedStatuses)) {
        const validStatuses = parsed.selectedStatuses.filter((status) =>
          statusChoices.some((choice) => choice.key === status)
        );

        if (validStatuses.length > 0) {
          setSelectedStatuses(validStatuses);
        }
      }
    } catch {
      window.localStorage.removeItem(settingsStorageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      settingsStorageKey,
      JSON.stringify({
        dataIni,
        dataFim,
        rangePreset,
        selectedStatuses
      })
    );
  }, [dataIni, dataFim, rangePreset, selectedStatuses]);

  const filteredInvoices = useMemo(() => {
    if (!result) {
      return [];
    }

    const byStatus =
      filter === "all"
        ? result.faturas
        : result.faturas.filter((invoice) => invoice.grupo === filter);
    const term = nameSearch.trim().toLowerCase();

    if (!term) {
      return byStatus;
    }

    const searched = byStatus.filter((invoice) =>
      [
        invoice.clienteNome,
        invoice.clienteId,
        invoice.descricao,
        invoice.parcela,
        invoice.id
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );

    return searched;
  }, [filter, nameSearch, result]);
  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      let left: string | number = "";
      let right: string | number = "";

      if (sortKey === "cliente") {
        left = a.clienteNome ?? "";
        right = b.clienteNome ?? "";
      } else if (sortKey === "vencimento") {
        left = parseDisplayDate(a.vencimento)?.getTime() ?? 0;
        right = parseDisplayDate(b.vencimento)?.getTime() ?? 0;
      } else if (sortKey === "pagamento") {
        left = parseDisplayDate(a.pagamento)?.getTime() ?? 0;
        right = parseDisplayDate(b.pagamento)?.getTime() ?? 0;
      } else if (sortKey === "valor") {
        left = a.valor ?? 0;
        right = b.valor ?? 0;
      } else {
        left = a.statusLabel;
        right = b.statusLabel;
      }

      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }

      return String(left).localeCompare(String(right), "pt-BR") * direction;
    });

    return sorted;
  }, [filteredInvoices, sortDirection, sortKey]);
  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = sortedInvoices.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, sortedInvoices.length);
  const paginatedInvoices = sortedInvoices.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  async function runSearch(search: () => Promise<void>) {
    const loadingStart = Date.now();
    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      await search();
      setFilter("all");
      setNameSearch("");
      setCurrentPage(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao consultar a API.");
    } finally {
      const elapsed = Date.now() - loadingStart;
      await wait(Math.max(0, 4000 - elapsed));
      setIsLoading(false);
    }
  }

  async function onClientSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runSearch(async () => {
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
    });
  }

  async function onInvoiceSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsStatusMenuOpen(false);

    await runSearch(async () => {
      const response = await fetch("/api/cobrancas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataIni,
          dataFim,
          periodo: "1",
          statuses: selectedStatuses
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Falha ao buscar cobranças.");
      }

      setResult(payload);
    });
  }

  function changeMainTab(nextTab: MainTab) {
    if (nextTab === activeTab) {
      return;
    }

    setActiveTab(nextTab);
    setError("");
    setResult(null);
    setFilter("all");
    setNameSearch("");
    setCurrentPage(1);
    setIsStatusMenuOpen(false);
    setIsCalendarOpen(false);
  }

  function toggleStatus(status: InvoiceGroup) {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status]
    );
  }

  function handleFilterChange(nextFilter: Filter) {
    if (nextFilter !== filter) {
      setFilter(nextFilter);
      setCurrentPage(1);
    }
  }

  function handleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextSortKey);
      setSortDirection("asc");
    }

    setCurrentPage(1);
  }

  function clearInvoiceFilters() {
    const range = presetRange("currentMonth");

    setRangePreset("currentMonth");
    setDataIni(range.start);
    setDataFim(range.end);
    setCalendarMonth(parseInputDate(range.start));
    setRangeDraftStart(null);
    setSelectedStatuses(["paid", "overdue", "open", "other"]);
    setIsStatusMenuOpen(false);
    setIsCalendarOpen(false);
    setFilter("all");
    setNameSearch("");
    setCurrentPage(1);
    setResult(null);
    setError("");
  }

  function exportCurrentCsv() {
    if (sortedInvoices.length === 0) {
      showActionFeedback("Não há faturas para exportar.");
      return;
    }

    downloadCsv(`faturas-${inputDate(new Date())}.csv`, sortedInvoices);
    showActionFeedback("CSV exportado.");
  }

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value) as PageSize);
    setCurrentPage(1);
  }

  function handleNameSearchChange(value: string) {
    setNameSearch(value);
    setCurrentPage(1);
  }

  function showActionFeedback(message: string) {
    setActionFeedback(message);
    window.setTimeout(() => setActionFeedback(""), 2600);
  }

  async function handleCopyAction(value: string | null, successMessage: string) {
    const copied = await copyText(value);
    showActionFeedback(
      copied ? successMessage : "Não foi possível copiar. Verifique as permissões do navegador."
    );
  }

  function handleOpenBoleto(value: string | null) {
    if (!value) {
      showActionFeedback("Esta fatura não possui link de boleto.");
      return;
    }

    try {
      const url = new URL(value);
      const opened = window.open(url.toString(), "_blank");

      if (opened) {
        opened.opener = null;
        return;
      }

      window.location.assign(url.toString());
    } catch {
      showActionFeedback("Link do boleto inválido.");
    }
  }

  function handleRangePresetChange(value: string) {
    const nextPreset = value as RangePreset;
    setRangePreset(nextPreset);
    setRangeDraftStart(null);

    if (nextPreset === "custom") {
      setCalendarMonth(parseInputDate(dataIni));
      setIsCalendarOpen(true);
      return;
    }

    const range = presetRange(nextPreset);
    setDataIni(range.start);
    setDataFim(range.end);
    setCalendarMonth(parseInputDate(range.start));
    setIsCalendarOpen(false);
  }

  function handleCalendarDateClick(date: Date) {
    const selected = inputDate(date);

    if (!rangeDraftStart) {
      setRangeDraftStart(selected);
      setDataIni(selected);
      setDataFim(selected);
      return;
    }

    if (selected < rangeDraftStart) {
      setDataIni(selected);
      setDataFim(rangeDraftStart);
    } else {
      setDataIni(rangeDraftStart);
      setDataFim(selected);
    }

    setRangeDraftStart(null);
  }

  function changeCalendarMonth(amount: number) {
    setCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + amount, 1)
    );
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
  const selectedStatusLabel =
    selectedStatuses.length === statusChoices.length
      ? "Todos os status"
      : `${selectedStatuses.length} selecionados`;
  const showCustomerColumn = activeTab === "invoices";

  return (
    <main className="appShell">
      {isLoading ? (
        <div className="loadingOverlay" role="status" aria-live="polite">
          <div className="loadingModal">
            <span className="loadingSpinner" aria-hidden="true" />
            <strong>Puxando dados</strong>
            <span>Consultando faturas e status financeiro...</span>
            <i aria-hidden="true" />
          </div>
        </div>
      ) : null}
      {actionFeedback ? (
        <div className="actionToast" role="status" aria-live="polite">
          {actionFeedback}
        </div>
      ) : null}
      {selectedInvoice ? (
        <div className="detailOverlay" role="dialog" aria-modal="true" aria-label="Detalhes da fatura">
          <div className="detailModal">
            <div className="detailHeader">
              <div>
                <span>Fatura</span>
                <strong>{selectedInvoice.parcela || selectedInvoice.id || "Detalhes"}</strong>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                aria-label="Fechar detalhes"
              >
                ×
              </button>
            </div>
            <InvoiceStatus invoice={selectedInvoice} />
            <dl className="detailGrid">
              <div>
                <dt>Cliente</dt>
                <dd>{selectedInvoice.clienteNome || selectedInvoice.clienteId || "-"}</dd>
              </div>
              <div>
                <dt>Vencimento</dt>
                <dd>{selectedInvoice.vencimento || "-"}</dd>
              </div>
              <div>
                <dt>Pagamento</dt>
                <dd>{selectedInvoice.pagamento || "-"}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{money(selectedInvoice.valor, selectedInvoice.valorOriginal)}</dd>
              </div>
              <div>
                <dt>Valor pago</dt>
                <dd>{money(selectedInvoice.valorPago, selectedInvoice.valorPagoOriginal)}</dd>
              </div>
              <div>
                <dt>Forma</dt>
                <dd>{selectedInvoice.formaPagamento || "-"}</dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>{selectedInvoice.id || "-"}</dd>
              </div>
              <div>
                <dt>Descrição</dt>
                <dd>{selectedInvoice.descricao || "-"}</dd>
              </div>
            </dl>
            <div className="detailActions">
              <button type="button" onClick={() => handleOpenBoleto(selectedInvoice.linkBoleto)}>
                <ExternalLink size={17} aria-hidden="true" />
                Abrir boleto
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCopyAction(selectedInvoice.linhaDigitavel, "Linha digitável copiada")
                }
              >
                <Copy size={17} aria-hidden="true" />
                Copiar linha digitável
              </button>
              <button
                type="button"
                onClick={() => handleCopyAction(selectedInvoice.qrcode, "QR Code copiado")}
              >
                <FileJson size={17} aria-hidden="true" />
                Copiar QR Code
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="workspace">
        <header className="topBar">
          <div>
            <span className="eyebrow">Batista Rastreamento</span>
            <h1>Painel financeiro</h1>
          </div>
          <div className="mainTabs" aria-label="Tipo de consulta">
            <button
              type="button"
              className={activeTab === "client" ? "active" : ""}
              onClick={() => changeMainTab("client")}
            >
              <Search size={17} aria-hidden="true" />
              Por cliente
            </button>
            <button
              type="button"
              className={activeTab === "invoices" ? "active" : ""}
              onClick={() => changeMainTab("invoices")}
            >
              <CalendarDays size={17} aria-hidden="true" />
              Buscar faturas
            </button>
          </div>
        </header>

        {activeTab === "client" ? (
          <form className="queryPanel clientQuery" onSubmit={onClientSubmit}>
            <div className="fieldGroup">
              <label htmlFor="documento">CPF ou CNPJ</label>
              <input
                id="documento"
                value={documento}
                onChange={(event) => setDocumento(maskDocument(event.target.value))}
                inputMode="numeric"
                placeholder="000.000.000-00"
                autoComplete="off"
              />
            </div>
            <button type="submit" disabled={isLoading}>
              <Search size={18} aria-hidden="true" />
              {isLoading ? "Consultando" : "Consultar"}
            </button>
          </form>
        ) : (
          <form className="queryPanel invoiceQuery" onSubmit={onInvoiceSearchSubmit}>
            <div className="fieldGroup">
              <label htmlFor="rangePreset">Intervalo</label>
              <select
                id="rangePreset"
                value={rangePreset}
                onChange={(event) => handleRangePresetChange(event.target.value)}
              >
                {rangePresetOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="fieldGroup rangeField">
              <label>Datas</label>
              <button
                className="dateRangeButton"
                type="button"
                onClick={() => {
                  setRangePreset("custom");
                  setCalendarMonth(parseInputDate(dataIni));
                  setIsCalendarOpen((value) => !value);
                }}
                aria-expanded={isCalendarOpen}
              >
                <CalendarDays size={17} aria-hidden="true" />
                {rangeLabel(dataIni, dataFim)}
              </button>
              {isCalendarOpen ? (
                <div className="calendarPopover">
                  <div className="calendarHeader">
                    <button
                      type="button"
                      onClick={() => changeCalendarMonth(-1)}
                      aria-label="Mês anterior"
                    >
                      <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <strong>{monthFormatter.format(calendarMonth)}</strong>
                    <button
                      type="button"
                      onClick={() => changeCalendarMonth(1)}
                      aria-label="Próximo mês"
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="calendarWeekdays">
                    {weekDays.map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="calendarGrid">
                    {calendarDays(calendarMonth).map((date) => {
                      const value = inputDate(date);
                      const isOutside = date.getMonth() !== calendarMonth.getMonth();
                      const isStart = value === dataIni;
                      const isEnd = value === dataFim;
                      const isInRange = value > dataIni && value < dataFim;
                      const isDraftStart = value === rangeDraftStart;

                      return (
                        <button
                          key={value}
                          className={[
                            isOutside ? "outside" : "",
                            isStart || isEnd ? "selected" : "",
                            isInRange ? "inRange" : "",
                            isDraftStart ? "draftStart" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          type="button"
                          onClick={() => handleCalendarDateClick(date)}
                        >
                          {date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                  <div className="calendarFooter">
                    <span>{rangeLabel(dataIni, dataFim)}</span>
                    <button type="button" onClick={() => setIsCalendarOpen(false)}>
                      Aplicar
                    </button>
                  </div>
                </div>
              ) : null}
              <input id="dataIni" type="hidden" value={dataIni} readOnly />
              <input id="dataFim" type="hidden" value={dataFim} readOnly />
            </div>
            <div className="fieldGroup statusField">
              <label>Status</label>
              <button
                className="statusSelectButton"
                type="button"
                onClick={() => setIsStatusMenuOpen((value) => !value)}
                aria-expanded={isStatusMenuOpen}
              >
                {selectedStatusLabel}
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {isStatusMenuOpen ? (
                <div className="statusDropdown">
                  {statusChoices.map((status) => (
                    <label key={status.key}>
                      <input
                        type="checkbox"
                        checked={selectedStatuses.includes(status.key)}
                        onChange={() => toggleStatus(status.key)}
                      />
                      <span>{status.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="queryActions">
              <button className="secondaryButton" type="button" onClick={clearInvoiceFilters}>
                <RefreshCcw size={17} aria-hidden="true" />
                Limpar
              </button>
              <button type="submit" disabled={isLoading}>
                <Search size={18} aria-hidden="true" />
                {isLoading ? "Buscando" : "Buscar"}
              </button>
            </div>
          </form>
        )}

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
            {result.pessoa ? (
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
            ) : null}

            {result.filtros ? (
              <section className="customerBand searchBand">
                <div>
                  <span>Base</span>
                  <strong>Vencimento</strong>
                </div>
                <div>
                  <span>Início</span>
                  <strong>{displayInputDate(result.filtros.dataIni)}</strong>
                </div>
                <div>
                  <span>Fim</span>
                  <strong>{displayInputDate(result.filtros.dataFim)}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>
                    {result.filtros.statuses
                      .map((status) => statusChoices.find((item) => item.key === status)?.label)
                      .filter(Boolean)
                      .join(", ")}
                  </strong>
                </div>
              </section>
            ) : null}

            {result.limiteAtingido ? (
              <div className="notice limitNotice" role="status">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>
                  A API retornou o limite de 500 faturas. Pode haver mais resultados.
                  Reduza o período ou selecione menos status.
                </span>
              </div>
            ) : null}

            <section className="summaryGrid" aria-label="Resumo financeiro">
              <SummaryCard
                title="Total"
                value={money(result.resumo.valorTotalContas)}
                detail={countLabel(result.resumo.countTotalContas)}
                icon={WalletCards}
                tone="toneTotal"
                onClick={() => handleFilterChange("all")}
              />
              <SummaryCard
                title="Vencidas"
                value={money(result.resumo.valorVencidas)}
                detail={countLabel(result.resumo.countVencidas)}
                icon={AlertTriangle}
                tone="toneOverdue"
                onClick={() => handleFilterChange("overdue")}
              />
              <SummaryCard
                title="Abertas"
                value={money(result.resumo.valorAbertas)}
                detail={countLabel(result.resumo.countAbertas)}
                icon={Clock3}
                tone="toneOpen"
                onClick={() => handleFilterChange("open")}
              />
              <SummaryCard
                title="Pagas"
                value={money(result.resumo.valorPagas)}
                detail={countLabel(result.resumo.countPagas)}
                icon={CheckCircle2}
                tone="tonePaid"
                onClick={() => handleFilterChange("paid")}
              />
            </section>

            <section className="invoiceSection">
              <div className="sectionHeader">
                <div>
                  <span>Faturas</span>
                  <strong>{countLabel(filteredInvoices.length)}</strong>
                </div>
                <div className="invoiceTools">
                  <label className="invoiceSearch">
                    <Search size={17} aria-hidden="true" />
                    <span>Buscar cliente, parcela ou ID</span>
                    <input
                      value={nameSearch}
                      onChange={(event) => handleNameSearchChange(event.target.value)}
                      placeholder="Buscar cliente, parcela ou ID"
                    />
                  </label>
                  <button
                    className="exportButton"
                    type="button"
                    onClick={exportCurrentCsv}
                    disabled={sortedInvoices.length === 0}
                  >
                    <Download size={17} aria-hidden="true" />
                    CSV
                  </button>
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
              </div>

              <div className="invoiceContent">
                {filteredInvoices.length > 0 ? (
                  <div className="paginationBar">
                    <span>
                      Mostrando {pageStart}-{pageEnd} de {filteredInvoices.length}
                    </span>
                    <label>
                      Por página
                      <select
                        value={pageSize}
                        onChange={(event) => handlePageSizeChange(event.target.value)}
                      >
                        {pageSizeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="paginationActions">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={safePage === 1}
                      >
                        Anterior
                      </button>
                      <strong>
                        {safePage} / {totalPages}
                      </strong>
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentPage((page) => Math.min(totalPages, page + 1))
                        }
                        disabled={safePage === totalPages}
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        {showCustomerColumn ? (
                          <th>
                            <SortHeader
                              label="Cliente"
                              sortFor="cliente"
                              activeSort={sortKey}
                              direction={sortDirection}
                              onSort={handleSort}
                            />
                          </th>
                        ) : null}
                        <th>Parcela</th>
                        <th>
                          <SortHeader
                            label="Status"
                            sortFor="status"
                            activeSort={sortKey}
                            direction={sortDirection}
                            onSort={handleSort}
                          />
                        </th>
                        <th>
                          <SortHeader
                            label="Vencimento"
                            sortFor="vencimento"
                            activeSort={sortKey}
                            direction={sortDirection}
                            onSort={handleSort}
                          />
                        </th>
                        <th>
                          <SortHeader
                            label="Pagamento"
                            sortFor="pagamento"
                            activeSort={sortKey}
                            direction={sortDirection}
                            onSort={handleSort}
                          />
                        </th>
                        <th>
                          <SortHeader
                            label="Valor"
                            sortFor="valor"
                            activeSort={sortKey}
                            direction={sortDirection}
                            onSort={handleSort}
                          />
                        </th>
                        <th>Pago</th>
                        <th>Forma</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedInvoices.map((invoice, index) => (
                        <tr key={`${invoice.id ?? "sem-id"}-${index}`}>
                          {showCustomerColumn ? (
                            <td>{invoice.clienteNome || invoice.clienteId || "-"}</td>
                          ) : null}
                          <td>{invoice.parcela || invoice.id || "-"}</td>
                          <td>
                            <InvoiceStatus invoice={invoice} />
                          </td>
                          <td>{invoice.vencimento || "-"}</td>
                          <td>{invoice.pagamento || "-"}</td>
                          <td>{money(invoice.valor, invoice.valorOriginal)}</td>
                          <td>{money(invoice.valorPago, invoice.valorPagoOriginal)}</td>
                          <td>{invoice.formaPagamento || "-"}</td>
                          <td>
                            <InvoiceActions
                              invoice={invoice}
                              onCopy={handleCopyAction}
                              onOpenBoleto={handleOpenBoleto}
                              onDetails={setSelectedInvoice}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobileInvoices">
                  {paginatedInvoices.map((invoice, index) => (
                    <article className="invoiceCard" key={`${invoice.id ?? "sem-id-mobile"}-${index}`}>
                      <div className="invoiceCardTop">
                        <strong>{invoice.parcela || invoice.id || "Fatura"}</strong>
                        <InvoiceStatus invoice={invoice} />
                      </div>
                      <dl>
                        {showCustomerColumn ? (
                          <div>
                            <dt>Cliente</dt>
                            <dd>{invoice.clienteNome || invoice.clienteId || "-"}</dd>
                          </div>
                        ) : null}
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
                      <InvoiceActions
                        invoice={invoice}
                        onCopy={handleCopyAction}
                        onOpenBoleto={handleOpenBoleto}
                        onDetails={setSelectedInvoice}
                      />
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
          </>
        ) : null}
      </section>
    </main>
  );
}
