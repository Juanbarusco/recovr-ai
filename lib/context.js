import { auth } from './auth.js';
import { sql } from './db.js';

export async function getUserContext() {
  const { data: session } = await auth.getSession();
  const user = session?.user || null;
  if (!user || !sql) return { user, org: null, role: null };

  const rows = await sql`
    select o.id, o.name, o.cnpj, o.plan, om.role
    from organization_members om
    join organizations o on o.id = om.organization_id
    where om.user_id = ${String(user.id)}
    order by om.created_at asc
    limit 1
  `;

  return {
    user,
    org: rows[0] ? { id: rows[0].id, name: rows[0].name, cnpj: rows[0].cnpj, plan: rows[0].plan } : null,
    role: rows[0]?.role || null,
  };
}
