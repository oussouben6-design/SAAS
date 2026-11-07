-- =====================================================================
-- 0022 — Le contexte RLS accepte aussi le jeton Supabase (modèle RPC)
--
-- `app.current_user_id()` ne lisait que la variable de session `organix.user_id`, posée par
-- `withSession()` du serveur Next.js. Conséquence : **toute** voie d'accès PostgREST (RPC
-- `security definer`, abonnements `supabase_realtime`, API générée) arrivait avec
-- `current_user_id() = null`, donc `app.has_permission(...) = false` et `*_select` filtré à
-- zéro ligne. Les fonctions récupérées en `0015`/`0016`/`0018` étaient ainsi incapables
-- d'identifier l'appelant : elles rejetaient systématiquement (« Permission refusée »), et la
-- notification temps réel ne parvenait à personne.
--
-- La fonction devient : variable de session d'abord (chemin serveur, inchangé et prioritaire), puis
-- `auth.uid()` si le projet est Supabase. `auth.uid()` lit `request.jwt.claims`, valeur que
-- PostgREST ne sait définir qu'à partir d'un JWT signé par le secret du projet : elle n'est pas
-- falsifiable par le client. Aucun droit additionnel n'est accordé ici — c'est le **contrôle**
-- qui devient exact sur les deux voies.
--
-- Sans schéma `auth` (PGlite, PostgreSQL auto-hébergé) : comportement strictement identique à
-- aujourd'hui (la variable de session reste la seule source).
-- =====================================================================

create or replace function app.current_user_id() returns uuid
language plpgsql stable
as $fn$
declare
  uid uuid;
begin
  -- 1) Voie applicative : le serveur Next.js pose le contexte dans la transaction.
  uid := nullif(current_setting('organix.user_id', true), '')::uuid;
  if uid is not null then
    return uid;
  end if;

  -- 2) Voie Supabase : jeton de l'API générée (PostgREST, Realtime, RPC).
  if to_regnamespace('auth') is not null then
    begin
      execute 'select auth.uid()' into uid;
    exception
      -- auth.uid() absente ou inaccessible : on reste sans contexte, jamais on ne devine.
      when undefined_function or undefined_table or insufficient_privilege then
        uid := null;
    end;
  end if;

  return uid;
end
$fn$;

comment on function app.current_user_id() is
  'Identifiant de l''utilisateur courant pour les politiques RLS : variable de session du serveur '
  'prioritaire, sinon auth.uid() (jeton Supabase). Renvoie null si aucun contexte : les politiques '
  'permissives filtrent alors tout.';

-- Le rôle applicatif doit continuer de pouvoir l'appeler (il est déjà couvert par les privilèges
-- par défaut de `0020`, on le réaffirme pour les bases créées avant cette migration).
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'organix_app') then
    execute 'grant execute on all functions in schema app to organix_app';
  end if;
end
$grant$;
