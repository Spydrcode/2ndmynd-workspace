-- Grant schema usage and table privileges for service_role
grant usage on schema ml to service_role;
grant all privileges on all tables in schema ml to service_role;
alter default privileges in schema ml grant all privileges on tables to service_role;
