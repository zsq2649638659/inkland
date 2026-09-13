import { redirect } from "next/navigation";

export default function EditProfilePage() {
  redirect("/profile-settings?tab=profile");
}
