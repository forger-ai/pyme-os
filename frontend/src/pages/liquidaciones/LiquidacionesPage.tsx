import { useState } from "react";
import PeriodList from "./PeriodList";
import PeriodDetail from "./PeriodDetail";
import type { Period } from "./types";

export default function LiquidacionesPage() {
  const [selected, setSelected] = useState<Period | null>(null);

  if (selected) {
    return (
      <PeriodDetail period={selected} onBack={() => setSelected(null)} />
    );
  }
  return <PeriodList onSelect={setSelected} />;
}
