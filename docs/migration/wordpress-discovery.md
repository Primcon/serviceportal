# WordPress Discovery (Migration Step M1)

The goal of discovery is to learn what the current WordPress portal stores, how much of it there is, and how clean it is, before we design the import. Its results decide the mapping (M2), the history scope (decision D11), how accounts move over (D2), and what happens to old paper forms (D16).

## What to request from whoever runs the WordPress site

1. **A database export** (`mysqldump`) of the production site, taken from a copy or a quiet period. A full export is best. If sharing customer data isn't possible yet, run [`discovery.sql`](../../scripts/wordpress-discovery/discovery.sql) against a copy instead and send back the output. It returns only counts and structure.
2. **The uploads folder** (`wp-content/uploads`), or at least the output of [`uploads-inventory.mjs`](../../scripts/wordpress-discovery/uploads-inventory.mjs) run against it.
3. **The list of active plugins**, and which ones make up the customer portal (anything for customer logins, file sharing, work orders, custom fields or forms).
4. **The table prefix** from `wp-config.php` (`$table_prefix`) if it isn't `wp_`.
5. **Any custom code**: the theme's `functions.php`, a child theme, or a custom plugin that builds the portal pages.
6. **A walkthrough**: 30 minutes with someone who uses the WordPress back end, showing how a work order, its photos and documents, and a customer account are set up today.

## How to run the discovery tools

Against a copy of the database:

```bash
mysql --table -u <user> -p <database> < scripts/wordpress-discovery/discovery.sql > discovery-output.txt
```

Against a copy of the uploads folder:

```bash
node scripts/wordpress-discovery/uploads-inventory.mjs "D:\wordpress-copy\wp-content\uploads"
```

Neither tool changes anything or prints customer names, emails, passwords or file names.

## What we'll learn, and what it decides

| Question | Where the answer comes from | Decides |
| --- | --- | --- |
| Which plugins and tables hold portal data? | Sections 2, 3, 15; plugin list; walkthrough | The import source for every entity (M2) |
| How are customers, repairs and equipment represented? | Sections 4, 5, 6 | Field mapping and legacy ID columns (M2) |
| How many customers, users, repairs and files, over how many years? | Sections 1, 4, 7, 9; uploads inventory | History scope (D11), storage cost, import run time |
| Are files attached to repairs, or loose in the media library? | Section 8 | Whether each file can be placed on the right work order |
| Which password format is used? | Section 11 | Account migration approach (D2) |
| How clean is the account data? | Sections 13, 14 | Cleanup before import, and company assignment |
| Are completed job forms stored as scans? | Section 7 (PDF/image counts by year), walkthrough | Old forms as Signed traveler documents (D16) |

## After discovery

Write up the findings as an inventory: sources, counts, file volume, data-quality problems, and a proposed history scope. That inventory closes Phase 0's migration step. The field-by-field mapping (M2) follows in Phase 1.
