import { MatchScreen } from "@/components/MatchScreen";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function MatchPage({ params }: PageProps) {
  const { code } = await params;
  return <MatchScreen joinCode={code} />;
}
