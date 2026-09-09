import { useAppState } from "./app-state.tsx";

export function Header() {
  const {
    source: { repository, piped, diff },
    display: { theme, setTheme },
    sidebar,
  } = useAppState();
  return (
    <header className="topbar">
      <button
        type="button"
        id="sidebar-toggle"
        className="icon-button"
        aria-controls="sidebar"
        aria-expanded={sidebar.expanded}
        aria-label={`${sidebar.expanded ? "Hide" : "Show"} file sidebar`}
        title={`${sidebar.expanded ? "Hide" : "Show"} file sidebar`}
        onClick={sidebar.toggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="1.5" />
          <path d="M15 3v18" />
          <path
            d={sidebar.expanded ? "m11 8-4 4 4 4Z" : "m7 8 4 4-4 4Z"}
            fill="currentColor"
            stroke="none"
          />
        </svg>
      </button>
      <a className="brand" href="/" aria-label="serve-diff home">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v10M7 10h10M7 18h10" />
          </svg>
        </span>
        <span className="brand-name">serve-diff</span>
      </a>
      <span className="header-divider" />
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
      <span className="branch-badge">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {piped ? (
            <>
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
              <path d="m4 5 2.5 3L4 11m4-1h4" />
            </>
          ) : (
            <>
              <path d="M4 4v7m8-7v2a3 3 0 0 1-3 3H7" />
              <circle cx="4" cy="3" r="2" />
              <circle cx="4" cy="13" r="2" />
              <circle cx="12" cy="3" r="2" />
            </>
          )}
        </svg>
        <span id="branch">{repository?.branch ?? "—"}</span>
      </span>
      <span className="local-badge">
        <span /> Local only
      </span>
      <button
        type="button"
        id="refresh"
        className="button"
        aria-label="Refresh changes"
        title="Refresh changes (R)"
        hidden={piped}
        aria-busy={diff.busy}
        onClick={diff.refresh}
      >
        <span aria-hidden="true">↻</span>
        <span className="refresh-label">Refresh</span>
      </button>
      <button
        type="button"
        id="theme"
        className="icon-button"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        title="Switch theme"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        ◐
      </button>
    </header>
  );
}
