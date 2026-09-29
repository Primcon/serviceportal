# UI Foundation

The portal's look comes from a small set of design tokens and shared building blocks. Use them for every new or rebuilt screen so the portal stays consistent and a rebrand only touches one file.

## Tokens

Colors and fonts are defined once in the `@theme` block of [`src/app/globals.css`](../src/app/globals.css) and used through Tailwind utilities. Never write a hex value in a class name.

| Token | Use |
| --- | --- |
| `brand`, `brand-strong`, `brand-soft` | Primary actions, links, highlights, and their hover and tint |
| `ink`, `body`, `muted`, `subtle` | Headings, running text, secondary text, disabled text |
| `paper`, `surface`, `line` | Page and card backgrounds, tinted areas, borders and dividers |
| `danger`, `danger-soft` | Errors, destructive actions, warnings |
| `success`, `success-soft` | Confirmations and healthy states |
| `font-sans`, `font-display` | Open Sans for text, Roboto for headings |

Fonts load through `next/font` in the root layout, so they're served by the portal itself.

## Building blocks

All live in [`src/components/ui`](../src/components/ui):

- `buttonStyles({ variant, size })`: primary, secondary, outline, danger or ghost buttons. Works on `<button>` and `<Link>`.
- `fieldStyles` and `<Field>`: inputs, selects and textareas with a label, optional marker and hint. Invalid fields turn red automatically.
- `<Modal>`: dialogs. Handles Escape, focus and background scrolling.
- `<PageHeader>`: the eyebrow, title, description and actions at the top of a page.
- `<EmptyState>`: what to show when a list has nothing in it.
- `<Badge>`: short status labels.
- `panelStyles`, `eyebrowStyles`: card containers and small uppercase labels.

Forms submit through `ActionFeedbackForm`, and server actions return an `ActionResult` from `runAction` (see [`src/lib/run-action.ts`](../src/lib/run-action.ts)). Throw `UserFacingError` for messages the user should see.

Status and enum labels come from [`src/lib/labels.ts`](../src/lib/labels.ts).

Existing pages still use inline class names from before the foundation. Convert each page to these blocks when it's rebuilt, rather than in a separate pass.
