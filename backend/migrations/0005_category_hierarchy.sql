ALTER TABLE public.categories
  ADD COLUMN owner_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN level integer NOT NULL DEFAULT 1,
  ADD COLUMN system_key varchar(100),
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN version integer NOT NULL DEFAULT 1;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_owner_membership_fk
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES public.memberships(tenant_id, user_id) ON DELETE CASCADE;

DROP INDEX public.categories_tenant_name_type_unique;

UPDATE public.categories AS category
SET owner_user_id = owner_membership.user_id
FROM public.memberships AS owner_membership
WHERE category.tenant_id = owner_membership.tenant_id
  AND owner_membership.role = 'OWNER'
  AND NOT category.is_system
  AND category.owner_user_id IS NULL;

UPDATE public.categories
SET system_key = CASE
  WHEN type = 'INCOME' AND lower(name) = 'salaire' THEN 'income.employment'
  WHEN type = 'INCOME' AND lower(name) = 'autres revenus' THEN 'income.exceptional'
  WHEN type = 'EXPENSE' AND lower(name) = 'logement' THEN 'expense.housing'
  WHEN type = 'EXPENSE' AND lower(name) = 'alimentation' THEN 'expense.food'
  WHEN type = 'EXPENSE' AND lower(name) = 'transport' THEN 'expense.transport'
  WHEN type = 'EXPENSE' AND lower(name) IN ('santé', 'sante') THEN 'expense.health'
  WHEN type = 'EXPENSE' AND lower(name) = 'loisirs' THEN 'expense.leisure'
  WHEN type = 'EXPENSE' AND lower(name) = 'factures' THEN 'expense.housing.utilities'
  ELSE NULL
END,
level = CASE WHEN type = 'EXPENSE' AND lower(name) = 'factures' THEN 2 ELSE 1 END
WHERE is_system AND system_key IS NULL;

WITH family(system_key, name, type, color, icon, sort_order) AS (
  VALUES
    ('income.employment', 'Emploi', 'INCOME'::public.category_type, '#769450', 'briefcase-business', 10),
    ('income.business', 'Activité professionnelle', 'INCOME'::public.category_type, '#5F8D7A', 'store', 20),
    ('income.investments', 'Placements', 'INCOME'::public.category_type, '#7799A6', 'chart-no-axes-combined', 30),
    ('income.support', 'Aides et transferts reçus', 'INCOME'::public.category_type, '#9A8DB5', 'hand-helping', 40),
    ('income.exceptional', 'Entrées exceptionnelles', 'INCOME'::public.category_type, '#B58B4D', 'badge-plus', 50),
    ('expense.housing', 'Logement et services', 'EXPENSE'::public.category_type, '#8D7B68', 'house', 10),
    ('expense.food', 'Alimentation', 'EXPENSE'::public.category_type, '#DDA75B', 'shopping-basket', 20),
    ('expense.transport', 'Transport', 'EXPENSE'::public.category_type, '#7799A6', 'car', 30),
    ('expense.health', 'Santé et bien-être', 'EXPENSE'::public.category_type, '#C77C72', 'heart-pulse', 40),
    ('expense.family', 'Famille et vie personnelle', 'EXPENSE'::public.category_type, '#B78383', 'users', 50),
    ('expense.education', 'Éducation et activité professionnelle', 'EXPENSE'::public.category_type, '#6F8E9D', 'graduation-cap', 60),
    ('expense.leisure', 'Loisirs et mode de vie', 'EXPENSE'::public.category_type, '#A786A5', 'sparkles', 70),
    ('expense.financial', 'Obligations financières', 'EXPENSE'::public.category_type, '#9B7653', 'landmark', 80),
    ('expense.solidarity', 'Dons et solidarité', 'EXPENSE'::public.category_type, '#A37D91', 'hand-heart', 90),
    ('expense.projects', 'Projets et dépenses exceptionnelles', 'EXPENSE'::public.category_type, '#758F62', 'folder-kanban', 100)
)
INSERT INTO public.categories (tenant_id, name, type, level, system_key, sort_order, color, icon, is_system)
SELECT tenant.id, family.name, family.type, 1, family.system_key, family.sort_order, family.color, family.icon, true
FROM public.tenants AS tenant
CROSS JOIN family
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories AS existing
  WHERE existing.tenant_id = tenant.id AND existing.system_key = family.system_key
);

UPDATE public.categories AS child
SET parent_id = parent.id, sort_order = 20
FROM public.categories AS parent
WHERE child.tenant_id = parent.tenant_id
  AND child.system_key = 'expense.housing.utilities'
  AND parent.system_key = 'expense.housing';

WITH post(parent_key, system_key, name, type, sort_order) AS (
  VALUES
    ('income.employment', 'income.employment.salary', 'Salaire principal', 'INCOME'::public.category_type, 10),
    ('income.employment', 'income.employment.bonus', 'Prime et avantage', 'INCOME'::public.category_type, 20),
    ('income.business', 'income.business.sales', 'Vente', 'INCOME'::public.category_type, 10),
    ('income.business', 'income.business.fees', 'Honoraires et mission', 'INCOME'::public.category_type, 20),
    ('income.business', 'income.business.freelance', 'Activité indépendante', 'INCOME'::public.category_type, 30),
    ('income.investments', 'income.investments.interest', 'Intérêts', 'INCOME'::public.category_type, 10),
    ('income.investments', 'income.investments.dividend', 'Dividendes', 'INCOME'::public.category_type, 20),
    ('income.investments', 'income.investments.rent', 'Revenu locatif', 'INCOME'::public.category_type, 30),
    ('income.support', 'income.support.aid', 'Aide et allocation', 'INCOME'::public.category_type, 10),
    ('income.support', 'income.support.refund', 'Remboursement reçu', 'INCOME'::public.category_type, 20),
    ('income.support', 'income.support.family', 'Transfert familial reçu', 'INCOME'::public.category_type, 30),
    ('income.exceptional', 'income.exceptional.gift', 'Cadeau reçu', 'INCOME'::public.category_type, 10),
    ('income.exceptional', 'income.exceptional.sale', 'Revente personnelle', 'INCOME'::public.category_type, 20),
    ('income.exceptional', 'income.exceptional.other', 'Autre entrée exceptionnelle', 'INCOME'::public.category_type, 30),
    ('expense.housing', 'expense.housing.rent', 'Loyer ou mensualité', 'EXPENSE'::public.category_type, 10),
    ('expense.housing', 'expense.housing.maintenance', 'Entretien du logement', 'EXPENSE'::public.category_type, 30),
    ('expense.housing', 'expense.housing.insurance', 'Assurance habitation', 'EXPENSE'::public.category_type, 40),
    ('expense.food', 'expense.food.groceries', 'Courses alimentaires', 'EXPENSE'::public.category_type, 10),
    ('expense.food', 'expense.food.dining', 'Restaurant', 'EXPENSE'::public.category_type, 20),
    ('expense.food', 'expense.food.snacks', 'Collation et boisson', 'EXPENSE'::public.category_type, 30),
    ('expense.transport', 'expense.transport.public', 'Transport en commun', 'EXPENSE'::public.category_type, 10),
    ('expense.transport', 'expense.transport.fuel', 'Carburant', 'EXPENSE'::public.category_type, 20),
    ('expense.transport', 'expense.transport.taxi', 'Taxi et transport avec chauffeur', 'EXPENSE'::public.category_type, 30),
    ('expense.transport', 'expense.transport.maintenance', 'Entretien du véhicule', 'EXPENSE'::public.category_type, 40),
    ('expense.health', 'expense.health.care', 'Consultation et soins', 'EXPENSE'::public.category_type, 10),
    ('expense.health', 'expense.health.pharmacy', 'Pharmacie', 'EXPENSE'::public.category_type, 20),
    ('expense.health', 'expense.health.insurance', 'Assurance santé', 'EXPENSE'::public.category_type, 30),
    ('expense.health', 'expense.health.sport', 'Sport et bien-être', 'EXPENSE'::public.category_type, 40),
    ('expense.family', 'expense.family.children', 'Enfant et garde', 'EXPENSE'::public.category_type, 10),
    ('expense.family', 'expense.family.clothing', 'Vêtement', 'EXPENSE'::public.category_type, 20),
    ('expense.family', 'expense.family.personal', 'Soin personnel', 'EXPENSE'::public.category_type, 30),
    ('expense.family', 'expense.family.pets', 'Animal de compagnie', 'EXPENSE'::public.category_type, 40),
    ('expense.education', 'expense.education.tuition', 'Scolarité et formation', 'EXPENSE'::public.category_type, 10),
    ('expense.education', 'expense.education.books', 'Livre et fourniture', 'EXPENSE'::public.category_type, 20),
    ('expense.education', 'expense.education.tools', 'Outil professionnel', 'EXPENSE'::public.category_type, 30),
    ('expense.leisure', 'expense.leisure.outings', 'Sortie et événement', 'EXPENSE'::public.category_type, 10),
    ('expense.leisure', 'expense.leisure.subscriptions', 'Abonnement de loisir', 'EXPENSE'::public.category_type, 20),
    ('expense.leisure', 'expense.leisure.travel', 'Voyage et vacances', 'EXPENSE'::public.category_type, 30),
    ('expense.leisure', 'expense.leisure.hobbies', 'Loisir personnel', 'EXPENSE'::public.category_type, 40),
    ('expense.financial', 'expense.financial.taxes', 'Impôt et taxe', 'EXPENSE'::public.category_type, 10),
    ('expense.financial', 'expense.financial.loans', 'Crédit et dette', 'EXPENSE'::public.category_type, 20),
    ('expense.financial', 'expense.financial.fees', 'Frais bancaire', 'EXPENSE'::public.category_type, 30),
    ('expense.financial', 'expense.financial.insurance', 'Autre assurance', 'EXPENSE'::public.category_type, 40),
    ('expense.solidarity', 'expense.solidarity.gifts', 'Cadeau offert', 'EXPENSE'::public.category_type, 10),
    ('expense.solidarity', 'expense.solidarity.donations', 'Don', 'EXPENSE'::public.category_type, 20),
    ('expense.solidarity', 'expense.solidarity.family', 'Soutien à un proche', 'EXPENSE'::public.category_type, 30),
    ('expense.projects', 'expense.projects.events', 'Événement personnel', 'EXPENSE'::public.category_type, 10),
    ('expense.projects', 'expense.projects.equipment', 'Équipement exceptionnel', 'EXPENSE'::public.category_type, 20),
    ('expense.projects', 'expense.projects.unplanned', 'Imprévu', 'EXPENSE'::public.category_type, 30)
)
INSERT INTO public.categories (tenant_id, parent_id, name, type, level, system_key, sort_order, color, icon, is_system)
SELECT parent.tenant_id, parent.id, post.name, post.type, 2, post.system_key, post.sort_order, parent.color, parent.icon, true
FROM public.categories AS parent
JOIN post ON post.parent_key = parent.system_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories AS existing
  WHERE existing.tenant_id = parent.tenant_id AND existing.system_key = post.system_key
);

SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_level_valid CHECK (level BETWEEN 1 AND 2),
  ADD CONSTRAINT categories_root_parent_valid CHECK ((level = 1 AND parent_id IS NULL) OR (level = 2 AND parent_id IS NOT NULL)),
  ADD CONSTRAINT categories_system_owner_valid CHECK (NOT is_system OR (owner_user_id IS NULL AND system_key IS NOT NULL)),
  ADD CONSTRAINT categories_version_positive CHECK (version > 0);

CREATE UNIQUE INDEX categories_tenant_system_key_unique
  ON public.categories (tenant_id, system_key) WHERE system_key IS NOT NULL;
CREATE UNIQUE INDEX categories_sibling_name_unique
  ON public.categories (
    tenant_id,
    type,
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  ) WHERE archived_at IS NULL;
CREATE INDEX categories_parent_idx ON public.categories (parent_id) WHERE archived_at IS NULL;
CREATE INDEX categories_owner_idx ON public.categories (owner_user_id) WHERE archived_at IS NULL;

CREATE FUNCTION private.validate_category_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  parent_row public.categories%ROWTYPE;
BEGIN
  IF NEW.level = 1 THEN
    IF NEW.parent_id IS NOT NULL OR NOT NEW.is_system OR NEW.owner_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_CATEGORY_FAMILY' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO parent_row
  FROM public.categories
  WHERE id = NEW.parent_id AND tenant_id = NEW.tenant_id AND archived_at IS NULL;

  IF NOT FOUND OR parent_row.level <> 1 OR parent_row.type <> NEW.type THEN
    RAISE EXCEPTION 'INVALID_CATEGORY_PARENT' USING ERRCODE = '23514';
  END IF;
  IF NEW.is_system AND NEW.owner_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_SYSTEM_CATEGORY_OWNER' USING ERRCODE = '23514';
  END IF;
  IF NOT NEW.is_system AND NEW.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_CATEGORY_REQUIRES_OWNER' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER categories_validate_hierarchy
  BEFORE INSERT OR UPDATE OF tenant_id, owner_user_id, parent_id, type, level, is_system
  ON public.categories FOR EACH ROW EXECUTE FUNCTION private.validate_category_hierarchy();

CREATE TABLE public.personal_category_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  name varchar(100) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_category_details_owner_membership_fk
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES public.memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT personal_category_details_tenant_category_fk
    FOREIGN KEY (tenant_id, category_id) REFERENCES public.categories(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT personal_category_details_tenant_id_owner_unique UNIQUE (tenant_id, id, owner_user_id)
);
CREATE UNIQUE INDEX personal_category_details_owner_name_unique
  ON public.personal_category_details (owner_user_id, category_id, lower(name)) WHERE archived_at IS NULL;
CREATE INDEX personal_category_details_owner_category_idx
  ON public.personal_category_details (owner_user_id, category_id) WHERE archived_at IS NULL;
CREATE INDEX personal_category_details_tenant_idx ON public.personal_category_details (tenant_id);

CREATE FUNCTION private.validate_personal_category_detail()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  category_row public.categories%ROWTYPE;
BEGIN
  SELECT * INTO category_row
  FROM public.categories
  WHERE id = NEW.category_id AND tenant_id = NEW.tenant_id AND archived_at IS NULL;
  IF NOT FOUND OR category_row.level <> 2 OR category_row.type NOT IN ('INCOME', 'EXPENSE') THEN
    RAISE EXCEPTION 'PERSONAL_DETAIL_REQUIRES_POST' USING ERRCODE = '23514';
  END IF;
  IF category_row.owner_user_id IS NOT NULL AND category_row.owner_user_id <> NEW.owner_user_id THEN
    RAISE EXCEPTION 'PERSONAL_DETAIL_POST_NOT_VISIBLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER personal_category_details_validate
  BEFORE INSERT OR UPDATE OF tenant_id, owner_user_id, category_id
  ON public.personal_category_details FOR EACH ROW EXECUTE FUNCTION private.validate_personal_category_detail();
CREATE TRIGGER personal_category_details_touch_updated_at
  BEFORE UPDATE ON public.personal_category_details
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.transactions ADD COLUMN personal_detail_id uuid;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_personal_detail_owner_fk
  FOREIGN KEY (tenant_id, personal_detail_id, created_by_id)
  REFERENCES public.personal_category_details(tenant_id, id, owner_user_id) ON DELETE RESTRICT;
CREATE INDEX transactions_personal_detail_idx ON public.transactions (personal_detail_id)
  WHERE personal_detail_id IS NOT NULL AND deleted_at IS NULL;

DROP POLICY categories_scope ON public.categories;
CREATE POLICY categories_select ON public.categories FOR SELECT
  USING (
    tenant_id = private.current_tenant_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
    AND (owner_user_id IS NULL OR owner_user_id = private.current_user_id())
  );
CREATE POLICY categories_insert ON public.categories FOR INSERT
  WITH CHECK (
    tenant_id = private.current_tenant_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
    AND (owner_user_id = private.current_user_id() OR (is_system AND owner_user_id IS NULL))
  );
CREATE POLICY categories_update ON public.categories FOR UPDATE
  USING (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  );

ALTER TABLE public.personal_category_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_category_details FORCE ROW LEVEL SECURITY;
CREATE POLICY personal_category_details_private_scope ON public.personal_category_details
  USING (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  );

REVOKE ALL ON public.personal_category_details FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.personal_category_details TO yahro_app;
GRANT EXECUTE ON FUNCTION private.validate_category_hierarchy() TO yahro_app;
GRANT EXECUTE ON FUNCTION private.validate_personal_category_detail() TO yahro_app;
