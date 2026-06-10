# Worksheet 5: Data Dictionary

**Goal:** List every individual piece of information you store, thing by thing. This is the final and most detailed worksheet — it becomes the literal blueprint for the database tables.

**Time:** 1–2 hours total
**You'll need:** Your completed Worksheets 1–4 and your spreadsheets open

---

## How this works

For each thing on your master list, fill out one table below listing every piece of information (every "field") you keep about it. Your Worksheet 2 column inventories already did most of this work — pull from those, then add:

- Fields hiding in **notes columns** (Worksheet 2, question 4)
- Fields hiding in **cell colors** (Worksheet 2, question 3)
- Fields that live **only in email or someone's head**

### Column guide

- **Field** — what you'd label it
- **Meaning** — one phrase, written so a new hire understands it
- **Example** — a real value
- **Required?** — must it be filled in for the record to make sense? (yes / no / eventually)
- **Type** — pick the closest: text / number / money / date / yes-no / choice-from-a-list / free-form notes
- **If "choice-from-a-list"** — list all valid choices
- **Who sets it / changes it?** — role or person

---

## Thing: ______________

| Field | Meaning | Example | Required? | Type | Choices (if a list) | Who sets it? |
|---|---|---|---|---|---|---|
| *Name* | *customer's full name or business name* | *Henderson Family* | *yes* | *text* | | *whoever takes the call* |
| *Status* | *where the job is in its life* | *scheduled* | *yes* | *choice* | *quoted, accepted, scheduled, in progress, done, invoiced, paid, cancelled* | *Sarah* |
| *Gate code* | *access code for the property* | *4412* | *no* | *text* | | *tech, after first visit* |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |

*(Copy this table once per thing. Add rows freely.)*

---

## Cross-checks (do these after filling in the tables)

**1. The other-thing check.** Scan each table for fields that actually describe a *different* thing. "Customer phone" in the Job table should just be a pointer to the customer — the phone number itself belongs in the Customer table, **once**. Mark any field like this with a → arrow and the thing it really belongs to. Don't delete it; just mark it.

**2. The calculated-field check.** Mark any field that is *computed from other fields* (job total = parts + labor; age = today − birthdate; balance = invoiced − paid). Write the formula. Databases usually calculate these on the fly rather than storing them — but only if we know the formula.

**3. The format-rules check.** For each field, are there rules about what's valid?

> *Examples: "Job numbers are always J- followed by 4 digits." "Discount can't exceed 20% without owner approval." "Completion date can't be before start date."*

```
(write rules here, referencing the field)
```

Every rule you write here is a mistake the database will catch automatically instead of a human catching it three weeks later.

**4. The privacy check.** Mark any field that's sensitive — payment details, personal info, anything only certain people should see. Note who should and shouldn't have access.

```
(write here)
```

---

## Last question, most important

**What information do you currently NOT capture that bites you later?**

Think of recent moments where someone said "I wish we'd written down ______." That's a field that should exist on day one of the new database.

```
(write here)
```
