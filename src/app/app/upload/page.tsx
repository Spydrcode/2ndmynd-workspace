import UploadClient from "./UploadClient";

type UploadPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function UploadPage({ searchParams }: UploadPageProps) {
  const website =
    typeof searchParams?.website === "string"
      ? searchParams.website
      : Array.isArray(searchParams?.website)
        ? searchParams?.website[0] ?? ""
        : "";

  return <UploadClient defaultWebsite={website} />;
}
