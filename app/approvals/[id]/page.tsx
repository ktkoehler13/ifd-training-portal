import { ApprovalReviewView } from "@/components/approvals/ApprovalReviewView";

interface ApprovalReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ApprovalReviewPage({
  params,
}: ApprovalReviewPageProps) {
  const { id } = await params;
  return <ApprovalReviewView requestId={id} />;
}
