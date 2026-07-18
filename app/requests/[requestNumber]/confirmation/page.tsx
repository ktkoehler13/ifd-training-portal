import { ConfirmationView } from "@/components/requests/ConfirmationView";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ requestNumber: string }>;
}) {
  const { requestNumber } = await params;

  return (
    <ConfirmationView requestNumber={decodeURIComponent(requestNumber)} />
  );
}
