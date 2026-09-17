import AdminShell from '@/components/admin/AdminShell'
import AuditLogTable from '@/components/admin/AuditLogTable'

export default function AuditLogPage() {
  return (
    <AdminShell
      title="Audit Log"
      subtitle="Every administrative action on the platform. Entries can't be edited or deleted. Click a row for details."
    >
      <AuditLogTable />
    </AdminShell>
  )
}
