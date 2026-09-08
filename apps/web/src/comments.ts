import type {
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import type { ChangedFile, RepositoryDiff } from "@serve-diff/shared";
import {
  type CommentAnnotation,
  commentContext,
  formatComments,
  parseComments,
  type ReviewComment,
} from "./review-model.ts";

function button(label: string, action: () => void, className = "quiet-button") {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.className = className;
  node.onclick = action;
  return node;
}
function label(comment: ReviewComment) {
  return `${comment.path}:${comment.start}${comment.end !== comment.start ? `–${comment.end}` : ""} · ${comment.side === "additions" ? "new" : "old"} · ${comment.scope}`;
}

interface Options {
  container: HTMLElement;
  copyButton: HTMLButtonElement;
  count: HTMLElement;
  feedback: HTMLElement;
  repository: () => RepositoryDiff | null;
  onChange: () => void;
  onNavigate: (comment: ReviewComment) => void;
}

export class Comments {
  private options: Options;
  private root = "";
  private comments: ReviewComment[] = [];
  private draft: ReviewComment | null = null;
  private focusDraft = false;

  constructor(options: Options) {
    this.options = options;
    options.copyButton.onclick = () => {
      void this.copy();
    };
    window.addEventListener("storage", (event) => {
      if (event.key === this.key()) {
        this.comments = parseComments(event.newValue);
        this.changed();
      }
    });
  }
  get composing() {
    return this.draft !== null;
  }
  private key() {
    return `serve-diff:comments:${this.root}`;
  }
  syncRepository() {
    const root = this.options.repository()?.root;
    if (root && root !== this.root) {
      this.root = root;
      this.draft = null;
      try {
        this.comments = parseComments(localStorage.getItem(this.key()));
      } catch {
        this.comments = [];
      }
    }
    this.renderList();
  }
  countFor(path: string) {
    return this.comments.filter((comment) => comment.path === path).length;
  }
  private anchored(comment: ReviewComment) {
    const repository = this.options.repository();
    return (
      comment.scope === repository?.mode &&
      repository.files.some(
        (file) =>
          file.path === comment.path &&
          file.fingerprint === comment.fingerprint,
      )
    );
  }
  private changed() {
    this.renderList();
    this.options.onChange();
  }
  private commit(comments: ReviewComment[]) {
    this.comments = comments;
    try {
      localStorage.setItem(this.key(), JSON.stringify(comments));
    } catch {
      this.options.feedback.textContent =
        "Browser storage unavailable. Copy comments to keep this session’s feedback.";
    }
    this.changed();
  }

  begin(file: ChangedFile, diff: FileDiffMetadata, range: SelectedLineRange) {
    const repository = this.options.repository();
    if (!repository) return;
    if (this.draft) {
      this.options.feedback.textContent =
        "Finish or cancel your current draft first.";
      this.focusDraft = true;
      this.options.onNavigate(this.draft);
      this.changed();
      return;
    }
    const context = commentContext(diff, range);
    if (!context) {
      this.options.feedback.textContent =
        "Select up to 200 visible lines on one side to comment.";
      return;
    }
    this.draft = {
      id: crypto.randomUUID(),
      path: file.path,
      scope: repository.mode,
      fingerprint: file.fingerprint,
      ...context,
      body: "",
      status: "open",
      createdAt: Date.now(),
    };
    this.focusDraft = true;
    this.options.feedback.textContent =
      "Draft open — automatic refresh paused.";
    this.changed();
  }

  annotations(file: ChangedFile): DiffLineAnnotation<CommentAnnotation>[] {
    const result: DiffLineAnnotation<CommentAnnotation>[] = this.comments
      .filter(
        (comment) =>
          comment.path === file.path &&
          this.anchored(comment) &&
          comment.id !== this.draft?.id,
      )
      .map((comment) => ({
        side: comment.side,
        lineNumber: comment.end,
        metadata: { kind: "saved", comment },
      }));
    if (this.draft?.path === file.path && this.anchored(this.draft)) {
      result.push({
        side: this.draft.side,
        lineNumber: this.draft.end,
        metadata: { kind: "draft" },
      });
    }
    return result;
  }
  renderAnnotation(annotation: CommentAnnotation): HTMLElement | undefined {
    return annotation.kind === "draft"
      ? this.renderEditor()
      : this.renderCard(annotation.comment, false);
  }

  private renderEditor(): HTMLElement | undefined {
    const draft = this.draft;
    if (!draft) return;
    const form = document.createElement("form");
    form.className = "comment-editor";
    const heading = document.createElement("strong");
    heading.textContent = `Comment on ${label(draft)}`;
    const input = document.createElement("textarea");
    input.placeholder = "Leave a review comment…";
    input.setAttribute("aria-label", "Review comment");
    input.rows = 3;
    input.value = draft.body;
    const actions = document.createElement("div");
    actions.className = "comment-actions";
    const hint = document.createElement("span");
    hint.textContent = "⌘ / Ctrl + Enter to save";
    const submit = button(
      "Save comment",
      () => form.requestSubmit(),
      "button primary-button",
    );
    submit.disabled = !draft.body.trim();
    input.oninput = () => {
      draft.body = input.value;
      submit.disabled = !draft.body.trim();
    };
    const cancel = () => {
      this.draft = null;
      this.options.feedback.textContent = "Draft cancelled.";
      this.changed();
    };
    input.onkeydown = (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        form.requestSubmit();
      }
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!draft.body.trim()) return;
      const saved = { ...draft, body: draft.body.trim() };
      const exists = this.comments.some((comment) => comment.id === saved.id);
      this.draft = null;
      this.commit(
        exists
          ? this.comments.map((comment) =>
              comment.id === saved.id ? saved : comment,
            )
          : [...this.comments, saved],
      );
      this.options.feedback.textContent = "Comment saved.";
    };
    actions.append(hint, button("Cancel", cancel), submit);
    form.append(heading, input, actions);
    if (this.focusDraft) {
      requestAnimationFrame(() => {
        if (!input.isConnected || input.getClientRects().length === 0) return;
        this.focusDraft = false;
        input.focus({ preventScroll: true });
        form.scrollIntoView({ block: "nearest" });
      });
    }
    return form;
  }

  private renderCard(comment: ReviewComment, sidebar: boolean) {
    const card = document.createElement("article");
    card.className = `comment-card${comment.status === "resolved" ? " resolved" : ""}`;
    card.dataset.commentId = comment.id;
    const header = document.createElement("div");
    header.className = "comment-card-header";
    if (sidebar) {
      const location = button(
        label(comment),
        () => this.options.onNavigate(comment),
        "comment-location",
      );
      location.title = label(comment);
      header.append(location);
    } else {
      const location = document.createElement("span");
      location.textContent = `Review · ${comment.side === "additions" ? "new" : "old"} line ${comment.start}${comment.end !== comment.start ? `–${comment.end}` : ""}`;
      header.append(location);
    }
    const state = document.createElement("span");
    state.className = "comment-state";
    state.textContent = comment.status === "resolved" ? "Resolved" : "Open";
    header.append(state);
    const body = document.createElement("p");
    body.className = "comment-body";
    body.textContent = comment.body;
    card.append(header, body);
    if (sidebar) {
      if (!this.anchored(comment)) {
        const stale = document.createElement("p");
        stale.className = "comment-outdated";
        stale.textContent =
          comment.scope !== this.options.repository()?.mode
            ? `From ${comment.scope} changes`
            : "Earlier diff — original code preserved";
        card.append(stale);
      }
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Code context";
      const code = document.createElement("pre");
      code.textContent = comment.code;
      details.append(summary, code);
      card.append(details);
    }
    const actions = document.createElement("div");
    actions.className = "comment-actions";
    actions.append(
      button("Edit", () => {
        if (this.draft) {
          this.options.feedback.textContent =
            "Finish or cancel your current draft first.";
          return;
        }
        this.draft = { ...comment };
        this.focusDraft = true;
        this.changed();
        this.options.onNavigate(comment);
      }),
      button(comment.status === "resolved" ? "Reopen" : "Resolve", () =>
        this.commit(
          this.comments.map((entry) =>
            entry.id === comment.id
              ? {
                  ...entry,
                  status: entry.status === "open" ? "resolved" : "open",
                }
              : entry,
          ),
        ),
      ),
      button("Delete", () =>
        this.commit(this.comments.filter((entry) => entry.id !== comment.id)),
      ),
    );
    card.append(actions);
    return card;
  }

  renderList() {
    const { container, copyButton, count } = this.options;
    count.textContent = String(this.comments.length);
    copyButton.disabled = this.comments.length === 0;
    container.replaceChildren();
    const summary = document.createElement("p");
    summary.className = "comment-summary";
    const open = this.comments.filter(
      (comment) => comment.status === "open",
    ).length;
    summary.textContent = `${open} open · ${this.comments.length - open} resolved`;
    container.append(summary);
    if (this.draft) {
      if (!this.anchored(this.draft)) {
        const editor = this.renderEditor();
        if (editor) container.append(editor);
      } else
        container.append(
          button(
            "Continue draft",
            () => {
              if (this.draft) {
                this.focusDraft = true;
                this.options.onNavigate(this.draft);
                this.options.onChange();
              }
            },
            "button",
          ),
        );
    }
    for (const comment of this.comments)
      container.append(this.renderCard(comment, true));
    if (this.comments.length === 0) {
      const help = document.createElement("p");
      help.className = "comment-empty";
      help.textContent =
        "Hover a code line and click + to leave feedback. Select several lines to comment on a range. Saved comments stay in this browser and can be copied for your coding agent.";
      container.append(help);
    }
  }

  private async copy() {
    const output = formatComments(this.comments);
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      this.options.feedback.textContent = `Copied ${this.comments.length} ${this.comments.length === 1 ? "comment" : "comments"} as XML.`;
    } catch {
      const dialog = document.createElement("dialog");
      dialog.className = "copy-dialog";
      const heading = document.createElement("h2");
      heading.textContent = "Copy review comments";
      const hint = document.createElement("p");
      hint.textContent =
        "Clipboard access is unavailable. Copy the selected text with ⌘C / Ctrl+C.";
      const input = document.createElement("textarea");
      input.value = output;
      input.readOnly = true;
      input.setAttribute("aria-label", "Comments XML");
      dialog.append(
        heading,
        hint,
        input,
        button("Close", () => dialog.close(), "button"),
      );
      dialog.onclose = () => dialog.remove();
      document.body.append(dialog);
      dialog.showModal();
      input.focus();
      input.select();
    }
  }
}
