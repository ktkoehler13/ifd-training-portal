import { ConfirmationView } from "@/components/requests/ConfirmationView";

interface RequestConfirmationPageProps {
  params: Promise<{ id: string }>;
}

export default async function RequestConfirmationPage({
  params,
}: RequestConfirmationPageProps) {
  const { id } = await params;
  return <ConfirmationView requestId={id} />;
}
