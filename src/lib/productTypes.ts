/**
 * lib/productTypes.ts
 *
 * UI-facing labels for the engine's ProductType union. The values match the
 * engine's ProductType exactly; only the labels are for display.
 */

import type { HairProfile } from "@/engine-bridge/analyze";

export type ProductType = HairProfile["productType"];

export interface ProductTypeOption {
  readonly value: ProductType;
  readonly label: string;
}

export const PRODUCT_TYPES: readonly ProductTypeOption[] = [
  { value: "shampoo", label: "Shampoo" },
  { value: "co_wash", label: "Co-wash" },
  { value: "rinse_out_conditioner", label: "Rinse-out conditioner" },
  { value: "leave_in_conditioner", label: "Leave-in conditioner" },
  { value: "deep_conditioner_mask", label: "Deep conditioner / mask" },
  { value: "hair_oil_serum", label: "Hair oil / serum" },
  { value: "styling_product", label: "Styling product" },
  { value: "treatment", label: "Treatment" },
];

const LABELS: Record<ProductType, string> = {
  shampoo: "Shampoo",
  co_wash: "Co-wash",
  rinse_out_conditioner: "Rinse-out conditioner",
  leave_in_conditioner: "Leave-in conditioner",
  deep_conditioner_mask: "Deep conditioner / mask",
  hair_oil_serum: "Hair oil / serum",
  styling_product: "Styling product",
  treatment: "Treatment",
  mask: "Mask",
  serum: "Serum",
};

export function productTypeLabel(type: ProductType): string {
  return LABELS[type] ?? type;
}
