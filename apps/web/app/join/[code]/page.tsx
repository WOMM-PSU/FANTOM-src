import { JoinScreen } from "@/components/JoinScreen";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function JoinPage({ params }: PageProps) {
  const { code } = await params;
  return <JoinScreen code={code} />;
}
