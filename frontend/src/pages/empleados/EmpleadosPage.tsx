import { useState } from "react";
import EmpleadosList from "./EmpleadosList";
import FichaEmpleado from "./FichaEmpleado";

export default function EmpleadosPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return (
      <FichaEmpleado
        employeeId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return <EmpleadosList onSelect={setSelectedId} />;
}
