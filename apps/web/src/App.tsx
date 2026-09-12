import { useAppState } from "./app-state.tsx";
import { DiffWorkspace } from "./DiffWorkspace.tsx";
import { FileExplorerNav, SidebarResizer } from "./FileExplorerNav.tsx";
import { Header } from "./Header.tsx";
import { CopyDialog } from "./review.tsx";

export function App() {
  const { review, sidebar } = useAppState();
  return (
    <>
      <Header />
      {sidebar.mobile && sidebar.open && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close review sidebar"
          tabIndex={-1}
          onClick={sidebar.closeMobile}
        />
      )}
      <div className="workspace">
        <FileExplorerNav />
        <SidebarResizer />
        <DiffWorkspace />
      </div>
      {review.copyText !== null && (
        <CopyDialog text={review.copyText} onClose={review.closeCopy} />
      )}
    </>
  );
}
