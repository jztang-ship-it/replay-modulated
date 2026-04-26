# Admin SQL queries

Run these in Supabase dashboard → SQL Editor.

## Read all messages (free-text user-to-team)

```sql
select user_id, answers->>'text' as message, created_at
from feedback_submissions
where answers->>'kind' = 'message'
order by created_at desc;
```

## Read each user's latest survey

```sql
select distinct on (user_id)
  user_id,
  answers->>'discovery'    as discovery,
  answers->>'best_part'    as best_part,
  answers->>'cash_prizes'  as cash_prizes,
  answers->>'next_sport'   as next_sport,
  answers->>'discord'      as discord,
  answers->>'wishlist'     as wishlist,
  submission_number,
  created_at
from feedback_submissions
where answers->>'kind' = 'survey'
order by user_id, submission_number desc;
```

## Aggregate vote counts (latest survey per user)

```sql
with latest as (
  select distinct on (user_id) user_id, answers->>'next_sport' as sport
  from feedback_submissions
  where answers->>'kind' = 'survey'
  order by user_id, submission_number desc
)
select sport, count(*) from latest where sport is not null group by sport order by count(*) desc;
```

## Cash-prize question distribution

```sql
with latest as (
  select distinct on (user_id) user_id, answers->>'cash_prizes' as response
  from feedback_submissions
  where answers->>'kind' = 'survey'
  order by user_id, submission_number desc
)
select response, count(*) from latest where response is not null group by response order by count(*) desc;
```

## Discovery channel distribution

```sql
with latest as (
  select distinct on (user_id) user_id, answers->>'discovery' as channel
  from feedback_submissions
  where answers->>'kind' = 'survey'
  order by user_id, submission_number desc
)
select channel, count(*) from latest where channel is not null group by channel order by count(*) desc;
```

## All wishlist free-text entries

```sql
select user_id, answers->>'wishlist' as wishlist, created_at
from feedback_submissions
where answers->>'kind' = 'survey'
  and answers->>'wishlist' is not null
  and trim(answers->>'wishlist') <> ''
order by created_at desc;
```

## Discord-interest cohort (for invites)

```sql
with latest as (
  select distinct on (user_id) user_id, answers->>'discord' as response
  from feedback_submissions
  where answers->>'kind' = 'survey'
  order by user_id, submission_number desc
)
select user_id, response from latest
where response in ('Yes — count me in', 'Maybe, send me details')
order by response, user_id;
```

## Submission count per user

```sql
select user_id,
  count(*) filter (where answers->>'kind' = 'survey')  as surveys,
  count(*) filter (where answers->>'kind' = 'message') as messages,
  max(created_at) as last_activity
from feedback_submissions
group by user_id
order by last_activity desc;
```
