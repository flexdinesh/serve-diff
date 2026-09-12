import { isDiffMode } from "@serve-diff/shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppState } from "./app-state.tsx";
import {
  DIFF_THEMES,
  LINE_DIFF_TYPES,
  readDiffTheme,
  readLineDiffType,
} from "./display-options.ts";

export function DiffToolbar() {
  const {
    source: { mode, piped, changeMode },
    display: {
      layout,
      setLayout,
      wrap,
      setWrap,
      diffTheme,
      setDiffTheme,
      lineDiffType,
      setLineDiffType,
      collapsed,
      setCollapsed,
    },
    navigation: { files },
  } = useAppState();
  const allCollapsed =
    files.length > 0 && files.every((file) => collapsed.has(file.path));
  return (
    <div className="toolbar">
      <ToggleGroup
        id="diff-scope"
        className="segmented modes"
        aria-label="Diff scope"
        hidden={piped}
        spacing={0}
        variant="default"
        size="sm"
        value={[mode]}
        onValueChange={(values) => {
          const value = values[0];
          if (value && isDiffMode(value)) changeMode(value);
        }}
      >
        {["all", "staged", "unstaged"].map((value) => (
          <ToggleGroupItem key={value} value={value} data-mode={value}>
            {value === "all"
              ? "All changes"
              : value === "staged"
                ? "Staged"
                : "Unstaged"}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="toolbar-spacer" />
      <Button
        type="button"
        id="collapse-all"
        variant="ghost"
        title="Collapse or expand all files"
        onClick={() =>
          setCollapsed(
            allCollapsed ? new Set() : new Set(files.map((file) => file.path)),
          )
        }
      >
        {allCollapsed ? "Expand all" : "Collapse all"}
      </Button>
      <Toggle
        id="wrap"
        pressed={wrap}
        title="Wrap long lines"
        onPressedChange={setWrap}
      >
        Wrap
      </Toggle>
      <div
        className="toolbar-select"
        title="Highlight changed text within paired modified lines"
      >
        <span id="inline-label">Inline</span>
        <Select
          value={lineDiffType}
          onValueChange={(value) => {
            if (value !== null) setLineDiffType(readLineDiffType(value));
          }}
        >
          <SelectTrigger aria-label="Inline change detail">
            <SelectValue>
              {LINE_DIFF_TYPES.find((option) => option.value === lineDiffType)
                ?.label ?? lineDiffType}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LINE_DIFF_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="toolbar-select">
        <span id="theme-label">Code theme</span>
        <Select
          value={diffTheme}
          onValueChange={(value) => {
            if (value !== null) setDiffTheme(readDiffTheme(value));
          }}
        >
          <SelectTrigger aria-label="Code theme">
            <SelectValue>
              {DIFF_THEMES.find((option) => option.value === diffTheme)
                ?.label ?? diffTheme}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DIFF_THEMES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ToggleGroup
        className="segmented"
        aria-label="Diff layout"
        spacing={0}
        variant="default"
        size="sm"
        value={[layout]}
        onValueChange={(values) => {
          const value = values[0];
          if (value === "split" || value === "unified") setLayout(value);
        }}
      >
        <ToggleGroupItem value="split" data-layout="split">
          Split
        </ToggleGroupItem>
        <ToggleGroupItem value="unified" data-layout="unified">
          Unified
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
