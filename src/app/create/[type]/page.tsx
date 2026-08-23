import { CreateWorkspace } from "@/app/create/CreateWorkspace";

const viewByType = {
  article: "text",
  image: "image",
  series: "series-create",
} as const;

export default async function CreateTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const initialView = viewByType[type as keyof typeof viewByType];

  if (!initialView) {
    return <CreateWorkspace />;
  }

  return <CreateWorkspace initialView={initialView} />;
}
