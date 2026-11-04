// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge, PriorityBadge } from "@/components/shared/filters";
import { StatCard, EmptyState, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

describe("design system", () => {
  it("affiche un libellé lisible pour un statut connu", () => {
    render(<StatusBadge status="done" />);
    expect(screen.getByText("Terminée")).toBeInTheDocument();
  });

  it("retombe sur le code brut pour un statut inconnu", () => {
    render(<StatusBadge status="experimental" />);
    expect(screen.getByText("experimental")).toBeInTheDocument();
  });

  it("traduit les priorités", () => {
    render(<PriorityBadge priority="critical" />);
    expect(screen.getByText("Critique")).toBeInTheDocument();
  });

  it("affiche une carte de statistique avec son indice", () => {
    render(<StatCard label="Tâches en retard" value={4} hint="sur 12" />);
    expect(screen.getByText("Tâches en retard")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("sur 12")).toBeInTheDocument();
  });

  it("rend un état vide explicite", () => {
    render(<EmptyState title="Aucun document" description="Importez un premier fichier." />);
    expect(screen.getByText("Aucun document")).toBeInTheDocument();
    expect(screen.getByText("Importez un premier fichier.")).toBeInTheDocument();
  });

  it("affiche un titre de page et ses actions", () => {
    render(
      <PageHeader
        title="Clients"
        description="Fiches clients"
        actions={<Button>Nouveau client</Button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Clients" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouveau client" })).toBeInTheDocument();
  });
});
