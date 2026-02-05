import RemoteAssistClient from "./RemoteAssistClient";

type RemoteAssistPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function RemoteAssistPage({ searchParams }: RemoteAssistPageProps) {
  const website =
    typeof searchParams?.website === "string"
      ? searchParams.website
      : Array.isArray(searchParams?.website)
        ? searchParams?.website[0] ?? ""
        : "";

  return <RemoteAssistClient defaultWebsite={website} />;
}
