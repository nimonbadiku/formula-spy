import { useState } from "react";
import { Button } from "@/components/Button";
import { GlassPanel } from "@/components/GlassPanel";
import { useAppStore } from "@/store/appStore";
import { PRODUCT_TYPES, type ProductType } from "@/lib/productTypes";
import { countTokens } from "@engine/engine/index";
import "./PasteScreen.css";

interface PasteScreenProps {
  readonly onAnalyze: (
    rawInci: string,
    productType: ProductType,
    productName: string,
  ) => void;
  readonly onEditProfile: () => void;
}

/** Lets the user pick a product type and paste one INCI list to analyze. */
export function PasteScreen({ onAnalyze, onEditProfile }: PasteScreenProps) {
  const profile = useAppStore((s) => s.profile);
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState<ProductType>("shampoo");
  const [rawInci, setRawInci] = useState("");

  const trimmed = rawInci.trim();
  let tokenCount = 0;
  try {
    tokenCount = trimmed ? countTokens(trimmed) : 0;
  } catch {
    tokenCount = 0;
  }
  const canAnalyze = tokenCount > 0;

  return (
    <div className="stack-24">
      <div className="spread">
        <div>
          <div className="eyebrow">Formula Spy</div>
          <h1 className="screen-title" style={{ marginTop: 4 }}>
            Analyze a product
          </h1>
        </div>
        <button
          className="profile-chip"
          onClick={onEditProfile}
          aria-label="Edit hair profile"
        >
          <span className="profile-chip__dot" />
          {profile ? "Profile" : "Set up"}
        </button>
      </div>

      <div className="stack-12">
        <label className="field-label">Product type</label>
        <div
          className="type-grid product-type-rail"
          aria-label="Product type options"
        >
          {PRODUCT_TYPES.map((pt) => (
            <button
              key={pt.value}
              type="button"
              className={`type-pill ${productType === pt.value ? "type-pill--active" : ""}`}
              aria-pressed={productType === pt.value}
              onClick={() => setProductType(pt.value)}
            >
              {pt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stack-12">
        <label className="field-label" htmlFor="product-name">
          Product name
        </label>
        <GlassPanel padding={4}>
          <input
            id="product-name"
            type="text"
            className="product-name-input"
            placeholder="e.g. OGX Argan Oil Shampoo"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            maxLength={80}
          />
        </GlassPanel>
      </div>

      <div className="stack-12">
        <div className="spread">
          <label className="field-label" htmlFor="inci">
            Ingredient list (INCI)
          </label>
          {tokenCount > 0 && (
            <span className="muted" style={{ fontSize: 13 }}>
              {tokenCount} ingredient{tokenCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <GlassPanel padding={4}>
          <textarea
            id="inci"
            className="inci-input"
            placeholder="Paste the full ingredient list here, e.g. Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin…"
            value={rawInci}
            onChange={(e) => setRawInci(e.target.value)}
            rows={7}
          />
        </GlassPanel>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Copy the ingredients straight from the product label or website.
          Separate them with commas. We analyze one product at a time.
        </p>
      </div>

      <Button
        fullWidth
        disabled={!canAnalyze}
        onClick={() => onAnalyze(trimmed, productType, productName.trim())}
      >
        Analyze formula
      </Button>
    </div>
  );
}
