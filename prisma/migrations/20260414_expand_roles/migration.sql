-- Expand UserRole enum (ADMIN -> SUPER_ADMIN, add PMB_SALES/PMB_RESELLER_MGR)
UPDATE users SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';

CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'PMB_SALES', 'PMB_RESELLER_MGR', 'RESELLER');
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role TYPE "UserRole_new" USING role::text::"UserRole_new";
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'RESELLER'::"UserRole_new";
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

-- Tenant.accountManagerId
ALTER TABLE tenants ADD COLUMN account_manager_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX tenants_account_manager_id_idx ON tenants(account_manager_id);

-- TenantMember additions
ALTER TABLE tenant_members ADD COLUMN max_discount INTEGER;
ALTER TABLE tenant_members ADD COLUMN status TEXT NOT NULL DEFAULT 'ATIVO';

-- Coupon audit + nullable tenant
ALTER TABLE coupons ADD COLUMN created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE coupons ADD COLUMN created_by_role "UserRole";
ALTER TABLE coupons ALTER COLUMN tenant_id DROP NOT NULL;

-- Enrollment — nullable tenant/tenantCourse + soldByUserId
ALTER TABLE enrollments ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE enrollments ALTER COLUMN tenant_course_id DROP NOT NULL;
ALTER TABLE enrollments ADD COLUMN sold_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX enrollments_sold_by_user_id_idx ON enrollments(sold_by_user_id);

-- Payment — nullable tenant + soldByUserId
ALTER TABLE payments ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN sold_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX payments_sold_by_user_id_idx ON payments(sold_by_user_id);
