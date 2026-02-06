import TestingClient from "./TestingClient";

export const dynamic = "force-dynamic";

export default async function TestingPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const internalParam =
    typeof searchParams?.internal === "string"
      ? searchParams.internal === "1"
      : Array.isArray(searchParams?.internal)
        ? searchParams?.internal[0] === "1"
        : false;

  return <TestingClient internalParam={internalParam} />;
}
