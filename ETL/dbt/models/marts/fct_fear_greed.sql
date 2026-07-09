-- FACT: Fear & Greed index. The simplest fact in the whole project --
-- staging already did all the work (dedupe/cast/rename), so this is a
-- pure pass-through. Not every fact needs to be complicated.

select * from {{ ref('stg_feargreed') }}
