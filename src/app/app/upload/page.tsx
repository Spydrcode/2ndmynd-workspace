import UploadClient from "./UploadClient";

export const dynamic = "force-dynamic";

export default async function UploadPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const website =
    typeof searchParams?.website === "string"
      ? searchParams.website
      : Array.isArray(searchParams?.website)
        ? searchParams?.website[0] ?? ""
        : "";

  return <UploadClient defaultWebsite={website} />;
}
