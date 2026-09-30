import UserPageView from "@/components/UserPageView";

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return <UserPageView params={params} pageMode="profile" />;
}
