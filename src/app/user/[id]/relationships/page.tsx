import UserPageView from "@/components/UserPageView";

export default function UserRelationshipsPage({ params }: { params: Promise<{ id: string }> }) {
  return <UserPageView params={params} pageMode="relationships" />;
}
