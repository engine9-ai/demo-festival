-- Give the seeded demo website key admin scope so e9core upgrade --url works.
UPDATE api_key
SET scopes = '["admin","people:write","tables:write","data:read"]'
WHERE id = 'f31c2c8f-0296-4dd8-9b3c-2b0e4f4dbe1a';
