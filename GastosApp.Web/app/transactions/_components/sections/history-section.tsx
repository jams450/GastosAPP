import type { ComponentProps } from "react";
import { HistoryPanel } from "../history/history-panel";

type HistoryPanelProps = ComponentProps<typeof HistoryPanel>;

type Props = {
  panelProps: HistoryPanelProps;
};

export function HistorySection({ panelProps }: Props) {
  return <HistoryPanel {...panelProps} />;
}
