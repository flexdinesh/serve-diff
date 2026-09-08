// Keep desktop width/collapse preferences separate from the mobile overlay state.
export function setupSidebar(
  sidebar: HTMLElement,
  toggle: HTMLElement,
  resize: HTMLElement,
) {
  const mobile = matchMedia("(max-width: 760px)");
  let collapsed = false;
  let width = 280;
  try {
    collapsed = localStorage.getItem("sidebar-collapsed") === "true";
    const saved = Number(localStorage.getItem("sidebar-width"));
    if (saved >= 200 && saved <= 520) width = saved;
  } catch {
    /* Preferences are optional. */
  }
  function persist() {
    try {
      localStorage.setItem("sidebar-collapsed", String(collapsed));
      localStorage.setItem("sidebar-width", String(width));
    } catch {
      /* Preferences are optional. */
    }
  }
  function render() {
    sidebar.classList.toggle("is-collapsed", collapsed);
    resize.hidden = collapsed || mobile.matches;
    const expanded = mobile.matches
      ? sidebar.classList.contains("open")
      : !collapsed;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute(
      "aria-label",
      `${expanded ? "Hide" : "Show"} file sidebar`,
    );
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
    resize.setAttribute("aria-valuenow", String(width));
  }
  function show() {
    if (mobile.matches) sidebar.classList.add("open");
    else collapsed = false;
    render();
    persist();
  }
  function closeMobile() {
    sidebar.classList.remove("open");
    render();
  }
  toggle.onclick = () => {
    if (mobile.matches) sidebar.classList.toggle("open");
    else collapsed = !collapsed;
    render();
    persist();
  };
  function setWidth(next: number) {
    width = Math.max(200, Math.min(520, window.innerWidth - 320, next));
    render();
    persist();
  }
  resize.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resize.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-sidebar");
  };
  resize.onpointermove = (event) => {
    if (resize.hasPointerCapture(event.pointerId)) setWidth(event.clientX);
  };
  resize.onpointerup = (event) => {
    if (resize.hasPointerCapture(event.pointerId))
      resize.releasePointerCapture(event.pointerId);
  };
  resize.onlostpointercapture = () =>
    document.body.classList.remove("resizing-sidebar");
  resize.onkeydown = (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setWidth(width + (event.key === "ArrowRight" ? 20 : -20));
    }
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobile.matches) closeMobile();
  });
  mobile.addEventListener("change", render);
  render();
  return { show, closeMobile };
}
