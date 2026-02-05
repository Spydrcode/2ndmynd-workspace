import TestingClient from "./TestingClient";

type TestingPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function TestingPage({ searchParams }: TestingPageProps) {
  const internalParam =
    typeof searchParams?.internal === "string"
      ? searchParams.internal === "1"
      : Array.isArray(searchParams?.internal)
        ? searchParams?.internal[0] === "1"
        : false;

  return <TestingClient internalParam={internalParam} />;
}
