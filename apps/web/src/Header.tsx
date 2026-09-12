import {
  GitBranchIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RefreshCwIcon,
  SquareTerminalIcon,
  SunMoonIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAppState } from "./app-state.tsx";

export function Header() {
  const {
    source: { repository, piped, diff },
    display: { theme, setTheme },
    sidebar,
  } = useAppState();
  return (
    <header className="topbar">
      <Button
        type="button"
        id="sidebar-toggle"
        variant="ghost"
        size="icon"
        aria-controls="sidebar"
        aria-expanded={sidebar.expanded}
        aria-label={`${sidebar.expanded ? "Hide" : "Show"} file sidebar`}
        title={`${sidebar.expanded ? "Hide" : "Show"} file sidebar`}
        onClick={sidebar.toggle}
      >
        {sidebar.expanded ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
      </Button>
      <a className="brand" href="/" aria-label="serve-diff home">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v10M7 10h10M7 18h10" />
          </svg>
        </span>
        <span className="brand-name">serve-diff</span>
      </a>
      <Separator className="header-divider" orientation="vertical" />
      <div className="header-heading">
        <div className="header-title">
          <h1 id="changes-title">{piped ? "Piped diff" : "Local diff"}</h1>
          {!piped && (
            <span id="repo-name">{repository?.name ?? "Local repository"}</span>
          )}
        </div>
        <p
          id="repo-path"
          title={piped ? "Re-run your command to update" : repository?.root}
        >
          {piped
            ? "Read from stdin · Re-run your command to update"
            : (repository?.root ?? "Reading your repository…")}
        </p>
      </div>
      <Badge variant="secondary" className="branch-badge">
        {piped ? <SquareTerminalIcon /> : <GitBranchIcon />}
        <span id="branch">{repository?.branch ?? "—"}</span>
      </Badge>
      <Badge variant="secondary" className="local-badge">
        <span /> Local only
      </Badge>
      <Button
        type="button"
        id="refresh"
        variant="outline"
        aria-label="Refresh changes"
        title="Refresh changes (R)"
        hidden={piped}
        aria-busy={diff.busy}
        onClick={diff.refresh}
      >
        <RefreshCwIcon aria-hidden="true" />
        <span className="refresh-label">Refresh</span>
      </Button>
      <Button
        type="button"
        id="theme"
        variant="ghost"
        size="icon"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        title="Switch theme"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <SunMoonIcon aria-hidden="true" />
      </Button>
    </header>
  );
}
