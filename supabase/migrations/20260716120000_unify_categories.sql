-- Unify job & service categories into one shared taxonomy (11 browse
-- categories). Remaps existing rows from the two old lists to the new names.
-- New listings use the shared list in src/lib/categories.js and the
-- categorize-job edge function (redeploy that function so it emits new names).
--
-- Idempotent: the WHERE clause only matches old names, so re-running is a no-op.

update public.jobs set category = case category
  when 'Fencing'        then 'Fencing & Gates'
  when 'Maintenance'    then 'Buildings & Maintenance'
  when 'Property Check' then 'Property & House Sitting'
  when 'House-sitting'  then 'Property & House Sitting'
  when 'Landscaping'    then 'Land & Vegetation'
  when 'Animal Care'    then 'Animals & Farm Sitting'
  when 'Machinery'      then 'Machinery & Repairs'
  when 'Labour'         then 'General Rural Help'
  when 'Spraying'       then 'Spraying & Pest Control'
  when 'Water'          then 'Water & Drainage'
  when 'General Labour' then 'General Rural Help'
  when 'Other'          then 'General Rural Help'
  else category
end
where category in (
  'Fencing','Maintenance','Property Check','House-sitting','Landscaping',
  'Animal Care','Machinery','Labour','Spraying','Water','General Labour','Other'
);

update public.services set category = case category
  when 'Machinery'      then 'Machinery & Repairs'
  when 'Labour'         then 'General Rural Help'
  when 'Water delivery' then 'Water & Drainage'
  when 'Animal care'    then 'Animals & Farm Sitting'
  when 'Maintenance'    then 'Buildings & Maintenance'
  when 'Fencing'        then 'Fencing & Gates'
  when 'Other'          then 'General Rural Help'
  else category
end
where category in (
  'Machinery','Labour','Water delivery','Animal care','Maintenance','Fencing','Other'
);
