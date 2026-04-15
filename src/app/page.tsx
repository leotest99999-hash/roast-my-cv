import { RoastMyCvApp } from "@/components/roast-my-cv-app";

type HomeProps = {
  searchParams: Promise<{
    session_id?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { session_id } = await searchParams;

  return <RoastMyCvApp initialSessionId={session_id ?? null} />;
}
