import { FlowBuilder } from "@/components/FlowBuilder";

export default async function EditFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FlowBuilder flowId={id} />;
}
