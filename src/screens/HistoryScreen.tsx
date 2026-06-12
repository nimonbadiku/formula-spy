import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useAppStore } from "@/store/appStore";
import type { HistoryEntry } from "@/store/types";
import { productTypeLabel, type ProductType } from "@/lib/productTypes";
import { formatDateTime } from "@/lib/format";
import "./HistoryScreen.css";

interface HistoryScreenProps {
  readonly onOpen: (entry: HistoryEntry) => void;
}

type FilterType = "all" | ProductType;

interface FilterOption {
  readonly value: FilterType;
  readonly label: string;
}

const FILTERS: readonly FilterOption[] = [
  { value: "all", label: "All" },
  { value: "shampoo", label: "Shampoo" },
  { value: "co_wash", label: "Co-wash" },
  { value: "rinse_out_conditioner", label: "Conditioner" },
  { value: "leave_in_conditioner", label: "Leave-in" },
  { value: "hair_oil_serum", label: "Oil / Serum" },
  { value: "styling_product", label: "Styling" },
  { value: "treatment", label: "Treatment" },
];

const DELETE_REVEAL_WIDTH = 84;
const DELETE_THRESHOLD = 104;

function scoreBarClass(score: number): string {
  if (score >= 90) return "score-90-plus";
  if (score >= 81) return "score-81-89";
  if (score >= 70) return "score-70-80";
  if (score >= 60) return "score-60-69";
  if (score >= 50) return "score-50-59";
  if (score >= 41) return "score-41-49";
  if (score >= 21) return "score-21-40";
  return "score-0-20";
}

function badgeLabel(type: ProductType): string {
  const map: Record<ProductType, string> = {
    shampoo: "Shampoo",
    co_wash: "Co-wash",
    rinse_out_conditioner: "Conditioner",
    leave_in_conditioner: "Leave-in",
    deep_conditioner_mask: "Deep Conditioner",
    hair_oil_serum: "Oil / Serum",
    styling_product: "Styling",
    treatment: "Treatment",
    mask: "Deep Conditioner",
    serum: "Oil / Serum",
  };
  return map[type] ?? type;
}

function badgeClass(type: ProductType): string {
  const map: Record<ProductType, string> = {
    shampoo: "badge-shampoo",
    co_wash: "badge-cowash",
    rinse_out_conditioner: "badge-conditioner",
    leave_in_conditioner: "badge-leavein",
    deep_conditioner_mask: "badge-deep",
    hair_oil_serum: "badge-oil",
    styling_product: "badge-styling",
    treatment: "badge-treatment",
    mask: "badge-deep",
    serum: "badge-oil",
  };
  return map[type] ?? "badge-shampoo";
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  );
}

function isThisWeek(date: Date): boolean {
  const weekStart = startOfWeek(new Date());
  return date >= weekStart;
}

interface TimeGroup {
  readonly label: string;
  readonly entries: readonly HistoryEntry[];
}

function groupByTime(history: readonly HistoryEntry[]): TimeGroup[] {
  const groups: Map<string, HistoryEntry[]> = new Map();

  for (const entry of history) {
    const date = new Date(entry.createdAt);
    if (Number.isNaN(date.getTime())) continue;

    let key: string;
    if (isToday(date)) {
      key = "Today";
    } else if (isYesterday(date)) {
      key = "Yesterday";
    } else if (isThisWeek(date)) {
      key = "This Week";
    } else {
      key = "Earlier";
    }

    const arr = groups.get(key) ?? [];
    arr.push(entry);
    groups.set(key, arr);
  }

  const order = ["Today", "Yesterday", "This Week", "Earlier"];
  return order
    .filter((key) => groups.has(key))
    .map((key) => ({ label: key, entries: groups.get(key)! }));
}

function displayProductName(entry: HistoryEntry, category: string): string {
  const name = entry.productName.trim();
  const categoryPrefix = `${category} · `;

  if (name.startsWith(categoryPrefix)) {
    return name.slice(categoryPrefix.length).trim();
  }

  return name || category;
}

function brandFromName(name: string): string {
  const parts = name.split(/[·\-]/);
  if (parts.length >= 2) return parts[0].trim();
  const words = name.trim().split(/\s+/);
  return words[0] ?? name;
}

function productFromName(name: string): string {
  const parts = name.split(/[·\-]/);
  if (parts.length >= 2) return parts.slice(1).join("·").trim();
  const words = name.trim().split(/\s+/);
  return words.slice(1).join(" ") || name;
}

function ingredientCount(rawInci: string): number {
  return rawInci.split(/[,\n;]/).filter((s) => s.trim().length > 0).length;
}

function ingredientPreview(rawInci: string, max = 5): string {
  const items = rawInci
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const preview = items.slice(0, max).join(", ");
  return items.length > max ? `${preview}, …` : preview;
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  return formatDateTime(iso);
}

function navigateToAnalyzeTab() {
  const navButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".bottom-nav__item"),
  );
  const analyzeButton = navButtons.find((button) =>
    button.textContent?.toLowerCase().includes("analyze"),
  );
  analyzeButton?.click();
}

function EmptyHistory() {
  return (
    <section className="history-empty-state" aria-label="Empty history">
      <div className="history-empty-state__orb" aria-hidden="true" />
      <div className="history-empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"
            stroke="currentColor"
            strokeWidth="1.9"
          />
          <path
            d="M15 15l4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path
            d="M8.8 10.5h3.4M10.5 8.8v3.4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h2>No products analyzed yet</h2>
      <p>Your smart beauty journal will track every formula you scan.</p>
      <button
        className="history-empty-state__button"
        onClick={navigateToAnalyzeTab}
      >
        Analyze your first product
      </button>
    </section>
  );
}

function SwipeHistoryCard({
  entry,
  index,
  onOpen,
  onDelete,
}: {
  readonly entry: HistoryEntry;
  readonly index: number;
  readonly onOpen: (entry: HistoryEntry) => void;
  readonly onDelete: (id: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const didDragRef = useRef(false);

  const score = Math.round(entry.score);
  const category = productTypeLabel(entry.productType);
  const badge = badgeLabel(entry.productType);
  const productName = displayProductName(entry, category);
  const brand = brandFromName(productName);
  const product = productFromName(productName);
  const clampedScore = Math.max(0, Math.min(100, score));
  const count = ingredientCount(entry.rawInci);
  const preview = ingredientPreview(entry.rawInci, 8);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    startXRef.current = event.clientX;
    startOffsetRef.current = offset;
    didDragRef.current = false;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;

    const deltaX = event.clientX - startXRef.current;
    if (Math.abs(deltaX) > 5) didDragRef.current = true;

    setOffset(
      Math.min(
        0,
        Math.max(-DELETE_THRESHOLD - 18, startOffsetRef.current + deltaX),
      ),
    );
  }

  function finishDrag() {
    if (!isDragging) return;

    setIsDragging(false);
    if (offset <= -DELETE_THRESHOLD) {
      setIsDeleting(true);
      return;
    }

    setOffset(offset <= -DELETE_REVEAL_WIDTH / 2 ? -DELETE_REVEAL_WIDTH : 0);
  }

  function handleAnimationEnd() {
    if (isDeleting) {
      onDelete(entry.id);
    }
  }

  function handleOpen() {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }

    onOpen(entry);
  }

  return (
    <div
      className={`history-card-shell ${isDeleting ? "is-deleting" : ""}`}
      style={{ animationDelay: `${Math.min(index * 55, 280)}ms` }}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="history-card-delete" aria-hidden="true">
        <span>Delete</span>
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <article
        className={`history-card ${isDragging ? "is-dragging" : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
        tabIndex={0}
        role="button"
        aria-label={`Open analysis for ${productName}. Swipe left to delete.`}
        onClick={handleOpen}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className="card-header">
          <div className="card-info">
            <div className="card-brand">{brand}</div>
            <div className="card-name">{product || productName}</div>
          </div>
          <span className={`card-badge ${badgeClass(entry.productType)}`}>
            {badge}
          </span>
        </div>

        <div className="card-ingredients">{preview}</div>

        <div className={`card-score ${scoreBarClass(score)}`}>
          <span className="score-label">Score</span>
          <div className="score-bar-track">
            <div
              className="score-bar-fill"
              style={{ width: `${clampedScore}%` } as CSSProperties}
            />
          </div>
          <span className="score-value">{clampedScore}</span>
        </div>

        <div className="card-meta">
          <div className="meta-item">
            <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
            <span>{relativeTime(entry.createdAt)}</span>
          </div>
          <div className="meta-dot" />
          <div className="meta-item">
            <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <span>{count} ingredients</span>
          </div>
        </div>
      </article>
    </div>
  );
}

export function HistoryScreen({ onOpen }: HistoryScreenProps) {
  const history = useAppStore((s) => s.history);
  const removeHistoryEntry = useAppStore((s) => s.removeHistoryEntry);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  const filtered = useMemo(() => {
    let entries = history;

    if (activeFilter !== "all") {
      entries = entries.filter((e) => e.productType === activeFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries.filter((e) => {
        const name = e.productName.toLowerCase();
        const category = productTypeLabel(e.productType).toLowerCase();
        return name.includes(q) || category.includes(q);
      });
    }

    return entries;
  }, [history, search, activeFilter]);

  const groups = useMemo(() => groupByTime(filtered), [filtered]);

  return (
    <div className="history-screen">
      <div className="spread history-header">
        <div>
          <div className="eyebrow">Formula Spy</div>
          <h1 className="screen-title" style={{ marginTop: 4 }}>
            Product History
          </h1>
        </div>
        <button className="history-profile-btn" aria-label="Profile">
          <span className="history-profile-dot" />
          Profile
        </button>
      </div>

      <div className="history-search-container">
        <div className="history-search-bar">
          <svg className="history-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            className="history-search-input"
            placeholder="Search products..."
            aria-label="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="history-filters" role="group" aria-label="Filter by product type">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`history-pill ${activeFilter === f.value ? "history-pill--active" : ""}`}
            onClick={() => setActiveFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {history.length === 0 ? (
        <EmptyHistory />
      ) : filtered.length === 0 ? (
        <div className="history-no-results">
          <p>No products match your search.</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="history-section">
            <div className="history-section-header">
              <span className="history-section-title">{group.label}</span>
              <span className="history-section-count">{group.entries.length}</span>
            </div>
            <div className="history-section-list">
              {group.entries.map((entry, index) => (
                <SwipeHistoryCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  onOpen={onOpen}
                  onDelete={removeHistoryEntry}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <div className="history-swipe-hint">Swipe left to delete</div>
    </div>
  );
}
