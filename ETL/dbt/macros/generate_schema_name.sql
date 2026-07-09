{#
    dbt's default behavior CONCATENATES the target schema + custom schema
    (e.g. "perpscope_marts_perpscope_staging"). We want models to land in the
    exact dataset named by +schema in dbt_project.yml (perpscope_raw already
    exists from Phase 1 -- this is the standard override dbt's own docs
    recommend for exactly this case).
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- set default_schema = target.schema -%}
    {%- if custom_schema_name is none -%}
        {{ default_schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
