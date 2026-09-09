import { isDiffMode } from "@serve-diff/shared";
import { useAppState } from "./app-state.tsx";

export function DiffToolbar() {
  const {
    source: { mode, piped, changeMode },
    display: { layout, setLayout, wrap, setWrap, collapsed, setCollapsed },
    navigation: { files },
  } = useAppState();
  const allCollapsed =
    files.length > 0 && files.every((file) => collapsed.has(file.path));
  return (
    <div className="toolbar">
      <fieldset
        id="diff-scope"
        className="segmented modes"
        aria-label="Diff scope"
        hidden={piped}
      >
        {["all", "staged", "unstaged"].map((value) => (
          <button
            key={value}
            type="button"
            data-mode={value}
            aria-pressed={mode === value}
            onClick={() => {
              if (isDiffMode(value)) changeMode(value);
            }}
          >
            {value === "all"
              ? "All changes"
              : value === "staged"
                ? "Staged"
                : "Unstaged"}
          </button>
        ))}
      </fieldset>
      <div className="toolbar-spacer" />
      <button
        type="button"
        id="collapse-all"
        className="quiet-button"
        title="Collapse or expand all files"
        onClick={() =>
          setCollapsed(
            allCollapsed ? new Set() : new Set(files.map((file) => file.path)),
          )
        }
      >
        {allCollapsed ? "Expand all" : "Collapse all"}
      </button>
      <button
        type="button"
        id="wrap"
        className="quiet-button"
        aria-pressed={wrap}
        title="Wrap long lines"
        onClick={() => setWrap(!wrap)}
      >
        Wrap
      </button>
      <fieldset className="segmented" aria-label="Diff layout">
        <button
          type="button"
          data-layout="split"
          aria-pressed={layout === "split"}
          onClick={() => setLayout("split")}
        >
          Split
        </button>
        <button
          type="button"
          data-layout="unified"
          aria-pressed={layout === "unified"}
          onClick={() => setLayout("unified")}
        >
          Unified
        </button>
      </fieldset>
    </div>
  );
}
