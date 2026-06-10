# Worksheet 4: Relationships

**Goal:** Describe how your things connect to each other. This is the skeleton of the database.

**Time:** 30–45 minutes
**You'll need:** Your master list from Worksheet 1

---

## How this works

For each pair of things that are connected, you'll write a plain-English sentence in both directions and answer "one or many?" each way.

> **Example:**
> - One **customer** can have **many** jobs.
> - One **job** belongs to exactly **one** customer.
>
> **Example:**
> - One **job** can use **many** parts.
> - One **part** (type) can be used on **many** jobs.

That's the whole skill. The "one or many" answers are what the designer needs.

---

## Step 1: Find the pairs

Look at your master list. For each pair of things that have anything to do with each other, add a row below. Skip pairs with no connection (parts and timesheets probably don't relate directly — they're both connected *through* jobs, and that's fine; the job rows capture it).

## Step 2: Fill in both directions

| Thing A | Thing B | One A has how many B's? (one / many) | One B has how many A's? (one / many) | Sentence in plain English |
|---|---|---|---|---|
| *Customer* | *Job* | *many* | *one* | *A customer can have many jobs; each job is for one customer* |
| *Job* | *Technician* | *many?* | *many* | *A job can have multiple techs; a tech works many jobs* |
| *Job* | *Invoice* | *see Step 3* | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

---

## Step 3: The tricky ones

For every relationship above, check it against these questions. Write notes next to any that apply — these edge cases are where databases get designed right or wrong.

**1. "Usually one, but sometimes..."**
You wrote "one," but is it *always* one? One invoice per job — but do you ever split a big job into two invoices? Ever combine three small jobs onto one invoice? **The exceptions count.** If it has ever happened, or could plausibly happen, it's "many."

```
(notes)
```

**2. Can it exist alone?**
Can a job exist without a customer? Can a part exist without a supplier? Can an invoice exist before its job?

```
(notes)
```

**3. Does the connection itself carry information?**
When a technician works a job, you might track *their hours on that job* or *their role* (lead vs. helper). That info doesn't belong to the tech or the job alone — it belongs to the *connection*. List any connections like that and what you track about them.

> *Example: Job↔Part: quantity used, price charged for it on this job.*

```
(notes)
```

**4. Does the connection change over time?**
Can a job be reassigned to a different customer (billing changes hands)? Can a tech be swapped mid-job? Do you need to know the old assignment afterward?

```
(notes)
```

---

## Step 4: Draw it (optional but encouraged)

On paper, draw a box for each thing and a line for each relationship. Write "1" or "many" at each end of each line. Photograph it and include it with the packet. It does not need to be pretty. Pen-on-napkin is a respected engineering format.
