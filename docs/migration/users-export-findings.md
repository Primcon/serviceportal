# WordPress User Export: Findings

What we learned from the WordPress user export (a CSV from a user-export plugin, received 2026-09-30). The export itself stays out of the repository. This page holds only counts and structure, never names, emails or other personal details.

## Shape

- 274 accounts, 141 columns, one row per user, no malformed rows.
- Accounts registered from 2013 to 2026. The `hidden_*` columns (application ID, password salt/format, security question, approval and lock-out flags) come from an older ASP.NET membership system that was imported into WordPress around 2014.
- 258 accounts have an email address, all unique. 16 have none (11 technicians, 5 customers).
- Only 18 accounts use their email as the WordPress login name, so customers mostly sign in with a username today.

## Roles

| WordPress role | Accounts | Disabled | Notes |
| --- | ---: | ---: | --- |
| `customer` | 126 | 20 | 18 of them use a VacTech, Busch or Pfeiffer email address |
| `techs` | 95 | 46 | 76 use a company email address; the disabled ones are likely former staff |
| `subscriber` | 31 | 0 | All registered in 2025–2026; 11 linked to a company. Possibly self-registrations that were never approved |
| `admin` | 13 | 0 | |
| `vactech_admin` | 6 | 0 | |
| `administrator` | 2 | 0 | WordPress site administrators |
| `wpseo_manager` | 1 | 0 | An SEO plugin role, not portal use |

## Links to customers and facilities

- **Company:** only 31 accounts (26 companies) link to a company record, through a custom field holding the WordPress ID of a `company` post. 109 of the 126 customers have no company link on their account, so the link between a customer and their repairs must live on the repair (WIP) records. **We need the WIP and company data to connect customers to their companies.**
- **Location:** 81 accounts have a `location` value, and it is only ever **AZ** (70) or **TX** (11). Most are staff. This suggests the suffix on WIP numbers is the facility (Arizona or Texas), which fits how the portal treats it now. VacTech still needs to confirm.

## Sign-in and passwords

- The password hashes are WordPress formats: 179 phpass (`$P$`) and 95 WordPress bcrypt (`$wp$`). Microsoft Entra External ID, which the portal uses for customer sign-in, can't import password hashes in any format, so **existing passwords can't carry over**.
- Customers keep their accounts even so. The portal matches a customer's first Entra sign-in to their imported account by verified email address, so their company access and history are waiting for them. The plan is to create each customer's Entra account in advance and send a "your portal has moved" email. On first sign-in the customer confirms their email with a one-time code and sets a new password; they don't fill in a registration form or wait for approval.
- Imported accounts get a placeholder identity (`wordpress:<user id>`) until their first sign-in. Before the import runs, the email match in `upsertEntraUser` should be tightened so it only claims an account that still has a placeholder identity. Today it would also take over an account already linked to a different sign-in.
- Employees sign in with their Microsoft work accounts, so staff WordPress accounts don't need logins. They're imported only so historical records show who did the work, and they link to the employee's work account by email when that person first signs in.

## Sensitive columns the importer must ignore

The export contains password hashes, legacy security questions and answers (198 accounts), 2FA secret keys (7 accounts) and session tokens (90 accounts). The importer reads an explicit allow-list of columns and never stores these. Keep the CSV off shared drives and email, and delete local copies once the import is done.

## Activity data

- `when_last_login` is set for only 75 accounts (2025–2026), and `techark_last_login` covers only August–September 2026, so neither shows how long an account has been inactive. The legacy `hidden_last_login_date` covers 2014–2025 for 198 accounts.
- `_is_disabled` and `hidden_is_approved` agree: 66 accounts are disabled and unapproved (46 technicians, 20 customers).

## Proposed account mapping (to confirm)

| WordPress | Portal |
| --- | --- |
| `customer`, enabled, with email | Customer user, linked to their company once the WIP/company data shows which one; gets a pre-created sign-in |
| `customer`, disabled | Imported for history, access removed |
| `customer` with a company email domain | Check each: likely staff testing the customer view, or a Busch/Pfeiffer site that is a real customer |
| `techs` | Employee (service user) for history attribution; roles assigned in the portal |
| `admin`, `vactech_admin` | Employee; manager or administrator to be decided per person |
| `administrator`, `wpseo_manager` | Not imported unless they're real portal users |
| `subscriber` | Needs a decision: approve as customers, or treat as open access requests |
| No email | Imported for history only; can't sign in |

## Still needed

1. The WIP (repair), company and model data, and how WIP records point to customers. This comes from a database export, or failing that more plugin exports (WIPs, companies).
2. Answers to the mapping questions above: subscribers, customer accounts on company email domains, and which admins become managers or administrators.
