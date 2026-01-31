import SnapshotForm from "./SnapshotForm";

export const dynamic = "force-dynamic";

export default async function SnapshotPage() {
  return (
    <div className="py-8">
      <SnapshotForm />
    </div>
  );
}
