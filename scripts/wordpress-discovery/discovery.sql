-- WordPress portal discovery (migration step M1)
--
-- Read-only. Every query returns counts, names or structure, never customer names,
-- emails, passwords or file contents, so the output is safe to share with the portal team.
--
-- Run against a COPY of the WordPress database (MySQL/MariaDB), for example:
--   mysql --table -u <user> -p <database> < discovery.sql > discovery-output.txt
--
-- The queries assume the default "wp_" table prefix. If the site uses another prefix
-- (check wp-config.php for $table_prefix), replace "wp_" throughout before running.

SELECT '1. Tables, row counts and sizes (largest first)' AS section;
SELECT table_name, table_rows AS approximate_rows, ROUND((data_length + index_length) / 1024 / 1024, 1) AS size_mb
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY (data_length + index_length) DESC;

SELECT '2. Non-core tables (usually added by plugins or custom code)' AS section;
SELECT table_name, table_rows AS approximate_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name NOT IN ('wp_commentmeta', 'wp_comments', 'wp_links', 'wp_options', 'wp_postmeta', 'wp_posts', 'wp_term_relationships', 'wp_term_taxonomy', 'wp_termmeta', 'wp_terms', 'wp_usermeta', 'wp_users')
ORDER BY table_name;

SELECT '3. Columns of non-core tables' AS section;
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name NOT IN ('wp_commentmeta', 'wp_comments', 'wp_links', 'wp_options', 'wp_postmeta', 'wp_posts', 'wp_term_relationships', 'wp_term_taxonomy', 'wp_termmeta', 'wp_terms', 'wp_usermeta', 'wp_users')
ORDER BY table_name, ordinal_position;

SELECT '4. Content types and statuses' AS section;
SELECT post_type, post_status, COUNT(*) AS items, MIN(post_date) AS oldest, MAX(post_date) AS newest
FROM wp_posts
GROUP BY post_type, post_status
ORDER BY items DESC;

SELECT '5. Custom fields used by non-standard content types (top 200)' AS section;
SELECT p.post_type, m.meta_key, COUNT(*) AS uses
FROM wp_postmeta m
JOIN wp_posts p ON p.ID = m.post_id
WHERE p.post_type NOT IN ('post', 'page', 'attachment', 'revision', 'nav_menu_item', 'customize_changeset', 'oembed_cache', 'wp_global_styles', 'wp_navigation', 'wp_template', 'wp_template_part', 'custom_css', 'user_request', 'wp_block', 'wp_font_family', 'wp_font_face')
GROUP BY p.post_type, m.meta_key
ORDER BY p.post_type, uses DESC
LIMIT 200;

SELECT '6. Taxonomies (categories, tags, custom groupings)' AS section;
SELECT tt.taxonomy, COUNT(*) AS terms, SUM(tt.count) AS assignments
FROM wp_term_taxonomy tt
GROUP BY tt.taxonomy
ORDER BY assignments DESC;

SELECT '7. Attachments by file type and upload year' AS section;
SELECT post_mime_type, YEAR(post_date) AS upload_year, COUNT(*) AS files
FROM wp_posts
WHERE post_type = 'attachment'
GROUP BY post_mime_type, YEAR(post_date)
ORDER BY upload_year, files DESC;

SELECT '8. Attachments linked to a parent item, by parent type' AS section;
SELECT COALESCE(parent.post_type, '(no parent)') AS parent_type, COUNT(*) AS files
FROM wp_posts a
LEFT JOIN wp_posts parent ON parent.ID = a.post_parent
WHERE a.post_type = 'attachment'
GROUP BY parent.post_type
ORDER BY files DESC;

SELECT '9. User accounts' AS section;
SELECT COUNT(*) AS users, MIN(user_registered) AS first_registered, MAX(user_registered) AS last_registered,
       SUM(user_status <> 0) AS non_default_status
FROM wp_users;

SELECT '10. Users by role' AS section;
SELECT meta_value AS capabilities, COUNT(*) AS users
FROM wp_usermeta
WHERE meta_key = 'wp_capabilities'
GROUP BY meta_value
ORDER BY users DESC;

SELECT '11. Password hash formats (decides how accounts can migrate)' AS section;
SELECT CASE
         WHEN user_pass LIKE '$wp$2y$%' THEN 'WordPress 6.8+ bcrypt ($wp$2y$)'
         WHEN user_pass LIKE '$2y$%' OR user_pass LIKE '$2b$%' THEN 'bcrypt'
         WHEN user_pass LIKE '$P$%' OR user_pass LIKE '$H$%' THEN 'phpass (legacy WordPress)'
         WHEN user_pass LIKE '$argon2%' THEN 'argon2'
         WHEN CHAR_LENGTH(user_pass) = 32 THEN 'md5 (very old)'
         WHEN user_pass = '' THEN 'empty'
         ELSE 'other'
       END AS hash_format,
       COUNT(*) AS users
FROM wp_users
GROUP BY hash_format;

SELECT '12. Profile fields stored per user (top 100)' AS section;
SELECT meta_key, COUNT(*) AS users_with_value
FROM wp_usermeta
WHERE meta_value <> ''
GROUP BY meta_key
ORDER BY users_with_value DESC
LIMIT 100;

SELECT '13. Accounts sharing an email domain (top 50, domains only)' AS section;
SELECT LOWER(SUBSTRING_INDEX(user_email, '@', -1)) AS email_domain, COUNT(*) AS users
FROM wp_users
GROUP BY email_domain
ORDER BY users DESC
LIMIT 50;

SELECT '14. Duplicate emails (count only)' AS section;
SELECT COUNT(*) AS emails_used_by_more_than_one_account
FROM (SELECT LOWER(user_email) AS email FROM wp_users GROUP BY LOWER(user_email) HAVING COUNT(*) > 1) duplicates;

SELECT '15. Active plugins and site settings' AS section;
SELECT option_name, LEFT(option_value, 2000) AS option_value
FROM wp_options
WHERE option_name IN ('active_plugins', 'template', 'stylesheet', 'db_version', 'siteurl', 'home', 'upload_path', 'upload_url_path', 'uploads_use_yearmonth_folders');
