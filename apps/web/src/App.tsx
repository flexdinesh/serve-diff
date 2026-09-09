import { useAppState } from "./app-state.tsx";
import { DiffWorkspace } from "./DiffWorkspace.tsx";
import { FileExplorerNav, SidebarResizer } from "./FileExplorerNav.tsx";
import { Header } from "./Header.tsx";
import { CopyDialog } from "./review.tsx";

export function App() {
  const { review } = useAppState();
  return (
    <>
      <Header />
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
