# Database Discovery Packet — Start Here

## What this is

Your business is moving from spreadsheets and email to a proper database. Before anyone builds anything, we need to know **what things your business keeps track of** and **what you need to know about each one**. That's what this packet figures out.

No technical knowledge is required. If you can describe how your business works, you can fill this out.

## What you'll produce

Five completed worksheets. Together they tell the database designer exactly what to build — and they'll catch problems now that would cost real money to fix later.

## Who should fill this out

The people who actually **do the work**, not just managers. The person who maintains the job spreadsheet knows things about it that nobody else does. If different people own different spreadsheets, split the worksheets up accordingly.

If two people disagree about what something means (e.g., what counts as a "customer"), **do not pick a winner**. Write both definitions down. Disagreements like this are the most valuable thing this packet can capture.

## Order of operations

Do these in order. Each one feeds the next.

| Step | Worksheet | What it does | Time estimate |
|---|---|---|---|
| 1 | `01-noun-harvest.md` | List the "things" your business tracks | 30–60 min |
| 2 | `02-spreadsheet-audit.md` | Document each existing spreadsheet (one copy per spreadsheet) | 30 min each |
| 3 | `03-entity-worksheet.md` | Describe each "thing" in detail (one copy per thing) | 20–30 min each |
| 4 | `04-relationships.md` | Describe how the things connect to each other | 30–45 min |
| 5 | `05-data-dictionary.md` | List every individual piece of information you store | 1–2 hours |

Total: plan for one to two working days spread across a week. Don't do it in one sitting — you'll remember things in the shower.

## Ground rules

1. **Describe what you actually do, not what you wish you did.** If the "official process" says one thing but everyone really does another, document the real one. The wish list goes in the "Pain points" sections.
2. **Use real examples.** Every worksheet asks for examples. Pull them from real spreadsheets and real emails (redact anything sensitive if needed, but keep the structure).
3. **"I don't know" is a valid answer.** Write it down. An honest gap is more useful than a guess.
4. **When in doubt, write more.** The designer can ignore extra detail. They cannot invent missing detail.
5. **Keep your spreadsheets handy.** Most of these worksheets are easier with the real spreadsheets open next to them.

## When you're done

Send back all completed worksheets, plus:

- A copy (or screenshot) of each spreadsheet you audited — a few rows of realistic data is enough, real or anonymized
- 3–5 example emails that represent how you coordinate work by email (forwarded or copied, sensitive details removed)

The emails matter. Anything your business coordinates by email instead of spreadsheet is usually something the spreadsheets *can't* represent — and that's exactly what the database needs to handle.
