// schema.js — the whole discovery packet as data.
// The form renderer and every exporter walk this structure, so worksheet
// content lives in exactly one place.
//
// Field kinds: "text" | "textarea" | "table" | "note"
//   table: { columns: [{ key, label, wide? }], example?: [row, ...] }
//   note:  instructional prose, rendered in the form and in exports

export const SCHEMA_VERSION = 1;

export const PACKET = {
  title: "Database Discovery Packet",
  intro:
    "Your business is moving from spreadsheets and email to a proper database. " +
    "Before anyone builds anything, we need to know what things your business keeps " +
    "track of and what you need to know about each one. No technical knowledge is " +
    "required — if you can describe how your business works, you can fill this out.",
  groundRules: [
    "Describe what you actually do, not what you wish you did. The wish list goes in the pain-point questions.",
    "Use real examples, pulled from real spreadsheets and real emails.",
    "\u201CI don\u2019t know\u201D is a valid answer. An honest gap beats a guess.",
    "When in doubt, write more. Extra detail can be ignored; missing detail can\u2019t be invented.",
    "If two people disagree about what something means, write down both definitions. Don\u2019t pick a winner — the disagreement is the valuable part.",
  ],
  worksheets: [
    // ────────────────────────────────────────────────────────── 1
    {
      id: "nounHarvest",
      num: 1,
      title: "Noun Harvest",
      blurb:
        "List the \u201Cthings\u201D your business keeps track of — customers, invoices, jobs, trucks, parts, whatever your world contains.",
      time: "30\u201360 min",
      repeatable: false,
      fields: [
        {
          key: "brainDump",
          kind: "textarea",
          label: "Part A — Brain dump",
          help:
            "Set a 10-minute timer. List every type of thing your business deals with, one per line. Don\u2019t filter. " +
            "Prompts: What do customers buy or hire you for? What shows up on an invoice? What do you schedule? " +
            "What breaks, runs out, or needs reordering? Who do you pay, and what for? What do you look up when a customer calls? " +
            "What has a status that changes? What do you have a stack, folder, or filing cabinet of?",
          example:
            "customers, jobs, quotes, invoices, payments, technicians, vans, parts, suppliers, purchase orders, warranties, permits, timesheets",
        },
        {
          key: "sheetRows",
          kind: "table",
          label: "Part B — Mine the spreadsheets",
          help:
            "Open each spreadsheet your business uses. What is each ROW in it? If a row is more than one thing " +
            "(\u201Ca job AND the customer\u2019s contact info AND the invoice amount\u201D), write all of them — that\u2019s exactly what the database will untangle. " +
            "Tip: uploading a spreadsheet on the Import tab fills this in for you.",
          columns: [
            { key: "sheet", label: "Spreadsheet name" },
            { key: "rowIs", label: "One row = one\u2026", wide: true },
          ],
          example: [
            { sheet: "Jobs 2026.xlsx", rowIs: "one job (plus some customer info crammed in)" },
            { sheet: "Customer List.xlsx", rowIs: "one customer" },
          ],
        },
        {
          key: "emailOnly",
          kind: "textarea",
          label: "Part C — Mine the email",
          help:
            "Skim 2\u20133 weeks of work email (the sent folder is often best). What do you coordinate by email that never makes it into any spreadsheet? " +
            "What do you email coworkers to ask about? What approvals happen by email? What goes wrong when an email gets missed?",
          example: "\u201CDid the parts come in?\u201D \u2014 parts orders are tracked nowhere. Job-completion sign-offs happen by email only.",
        },
        {
          key: "masterList",
          kind: "table",
          label: "Part D — Master list",
          help:
            "Merge Parts A\u2013C. Combine duplicates (\u201Cclient\u201D and \u201Ccustomer\u201D are probably the same thing — if they\u2019re NOT, keep both and explain the difference in Part E). " +
            "Most small businesses land between 8 and 20 things.",
          columns: [
            { key: "thing", label: "Thing (noun)" },
            { key: "example", label: "One real example", wide: true },
            { key: "count", label: "Roughly how many exist?" },
          ],
          example: [
            { thing: "Customer", example: "Henderson Family, 412 Oak St", count: "~300" },
            { thing: "Job", example: "Water heater replacement, Henderson, Jan 2026", count: "~40/month" },
          ],
        },
        {
          key: "fuzzyTerms",
          kind: "textarea",
          label: "Part E — Flag the fuzzy ones",
          help:
            "List any items where people in your business might disagree about what it means, or where one word means two different things. " +
            "This section is gold. Don\u2019t skip it.",
          example:
            "\u201CCustomer\u201D — sometimes the person who pays, sometimes the property where we work. A property manager pays for 12 buildings; is that 1 customer or 12?",
        },
      ],
    },
    // ────────────────────────────────────────────────────────── 2
    {
      id: "spreadsheetAudits",
      num: 2,
      title: "Spreadsheet Audit",
      blurb:
        "Document one existing spreadsheet — what\u2019s in it, how it\u2019s used, and where it hurts. Add one copy per spreadsheet, including the one only Carol uses. Especially that one.",
      time: "~30 min each",
      repeatable: true,
      instanceNoun: "spreadsheet",
      instanceLabelField: "name",
      fields: [
        { key: "name", kind: "text", label: "Spreadsheet name / filename" },
        { key: "maintainer", kind: "text", label: "Who maintains it?" },
        { key: "otherUsers", kind: "text", label: "Who else uses it?" },
        { key: "updateFreq", kind: "text", label: "How often is it updated?", help: "daily / weekly / when we remember" },
        { key: "rowIs", kind: "text", label: "One row = one\u2026" },
        { key: "rowCount", kind: "text", label: "Roughly how many rows?" },
        { key: "tabs", kind: "textarea", label: "Tabs — list them and what each is for" },
        {
          key: "columns",
          kind: "table",
          label: "Column inventory",
          help:
            "List EVERY column, even the embarrassing ones. The \u201CDescribes\u2026\u201D column matters most: does this column describe the row itself, or something else? " +
            "In a Jobs sheet, \u201CJob Date\u201D describes the job — but \u201CCustomer Phone\u201D describes the customer. This is the single most useful table in the whole packet.",
          columns: [
            { key: "col", label: "Column name" },
            { key: "meaning", label: "What it means", wide: true },
            { key: "example", label: "Example value" },
            { key: "describes", label: "Describes the row, or something else?" },
            { key: "filled", label: "Always filled in? (always / usually / rarely)" },
          ],
          example: [
            { col: "Job #", meaning: "our internal job number", example: "J-2041", describes: "the row (job)", filled: "always" },
            { col: "Cust Phone", meaning: "customer\u2019s cell", example: "555-0142", describes: "something else — the customer", filled: "usually" },
          ],
        },
        {
          key: "repeatedGroups",
          kind: "textarea",
          label: "Repeated column groups",
          help: "Columns like \u201CItem 1, Item 2, Item 3\u201D or \u201CPhone 1, Phone 2\u201D? List them. What happens when you need a 4th?",
        },
        {
          key: "statusValues",
          kind: "textarea",
          label: "Status columns — every value that actually appears",
          help:
            "For any column holding a status (\u201Cpending\u201D, \u201Cpaid\u201D, \u201Cdone\u201D\u2026), list every value that actually appears, including typos and one-offs. " +
            "Scroll the real column — don\u2019t go from memory. (Uploading the sheet does this perfectly.)",
        },
        {
          key: "colorCoding",
          kind: "textarea",
          label: "Color coding and formatting",
          help:
            "Cell colors, bold, strikethrough, highlighting that MEAN something? What does each mean? " +
            "Colors don\u2019t survive the move to a database unless we know they exist — a color is data hiding in formatting.",
          example: "Yellow row = waiting on parts. Red = customer hasn\u2019t paid. Strikethrough = cancelled.",
        },
        {
          key: "notesKinds",
          kind: "textarea",
          label: "The notes column",
          help:
            "Read 10\u201315 real entries from your Notes/Comments column and list the KINDS of things that end up there. " +
            "Each kind of note is usually a missing column — or a missing thing entirely.",
          example: "gate codes \u00B7 \u201Ccall after 3pm\u201D \u00B7 \u201CDO NOT send Mike again\u201D \u00B7 warranty dates \u00B7 \u201Cpaid cash\u201D",
        },
        {
          key: "duplication",
          kind: "textarea",
          label: "Duplicated information",
          help: "Does any information here also live somewhere else (another sheet, a notebook, someone\u2019s phone)? Which copy is \u201Ccorrect\u201D when they disagree?",
        },
        {
          key: "incidents",
          kind: "textarea",
          label: "What goes wrong with this spreadsheet?",
          help: "Real incidents, not hypotheticals.",
          example: "Two people edited at once and we lost a day of entries.",
        },
        {
          key: "wishQuestions",
          kind: "textarea",
          label: "What question do you wish this spreadsheet could answer, but can\u2019t?",
          example: "Which customers haven\u2019t had service in over a year?",
        },
      ],
    },
    // ────────────────────────────────────────────────────────── 3
    {
      id: "entities",
      num: 3,
      title: "Entity Worksheet",
      blurb:
        "Describe one \u201Cthing\u201D from your master list in detail — its life story, from the moment it enters your business to the moment you\u2019re done with it. Add one copy per thing; start with the most important ones.",
      time: "20\u201330 min each",
      repeatable: true,
      instanceNoun: "entity",
      instanceLabelField: "name",
      fields: [
        { key: "name", kind: "text", label: "Name of the thing", help: "e.g., \u201CJob\u201D" },
        { key: "definition", kind: "textarea", label: "Define it in one sentence, as if to a new hire" },
        { key: "example", kind: "text", label: "One real example" },
        { key: "volume", kind: "text", label: "Roughly how many exist / how many new ones per month?" },
        {
          key: "twinTest",
          kind: "textarea",
          label: "The twin test",
          help:
            "Could two of these look identical but be different? (Two customers named John Smith; two jobs at the same address.) How do you currently tell them apart?",
        },
        {
          key: "birth",
          kind: "textarea",
          label: "Birth — how does one come into existence?",
          help: "Walk through it step by step, including who does what.",
          example:
            "Customer calls or emails. Whoever answers writes it on the whiteboard. If it needs a quote, Dave visits the site first. Once accepted, Sarah adds a row to the Jobs spreadsheet and texts the techs.",
        },
        {
          key: "knownAtCreation",
          kind: "table",
          label: "Known at creation vs. filled in later",
          columns: [
            { key: "atCreation", label: "Known at creation", wide: true },
            { key: "later", label: "Filled in later", wide: true },
          ],
          example: [{ atCreation: "customer name, address, what they want", later: "final price, which tech, completion date" }],
        },
        { key: "changes", kind: "textarea", label: "Life — what changes about it over time?" },
        {
          key: "statuses",
          kind: "textarea",
          label: "Statuses — every state, in order, and what causes each move",
          example: "quoted \u2192 accepted \u2192 scheduled \u2192 in progress \u2192 done \u2192 invoiced \u2192 paid. Moves to \u201Cscheduled\u201D when Sarah assigns a tech and date.",
        },
        {
          key: "weirdPaths",
          kind: "textarea",
          label: "Can it go backwards or sideways?",
          help: "A paid invoice gets refunded; a scheduled job gets cancelled; a cancelled job gets un-cancelled. List the weird paths.",
        },
        {
          key: "lookups",
          kind: "table",
          label: "Lookups — when do you go looking for one, and what do you search by?",
          help: "This question quietly determines how fast your future database feels, so be thorough.",
          columns: [
            { key: "situation", label: "Situation", wide: true },
            { key: "searchBy", label: "What you search / filter by", wide: true },
          ],
          example: [{ situation: "Customer calls", searchBy: "name or address" }],
        },
        { key: "reports", kind: "textarea", label: "What lists or reports do you make (or wish you could) from these?" },
        {
          key: "death",
          kind: "textarea",
          label: "Death — are you ever DONE with one?",
          help: "What does \u201Cdone\u201D mean? Delete it, archive it, or keep it forever?",
        },
        {
          key: "lookback",
          kind: "textarea",
          label: "How far back do you actually look?",
          example: "\u201CWe never touch jobs older than 2 years\u201D vs. \u201Cwe need the full warranty history of every water heater we\u2019ve ever installed.\u201D",
        },
        {
          key: "history",
          kind: "textarea",
          label: "History — when something changes, do you ever need the OLD value?",
          help:
            "Customer moves: do invoices need the old address? You raise your hourly rate: do old jobs keep the old rate? " +
            "Spreadsheets answer this worst — overwriting a cell destroys the old value. A database can keep history, but only for the things you tell us need it.",
        },
      ],
    },
    // ────────────────────────────────────────────────────────── 4
    {
      id: "relationships",
      num: 4,
      title: "Relationships",
      blurb:
        "Describe how your things connect to each other. This is the skeleton of the database. The whole skill: write each connection as a plain sentence in both directions, and answer \u201Cone or many?\u201D each way.",
      time: "30\u201345 min",
      repeatable: false,
      fields: [
        {
          key: "pairs",
          kind: "table",
          label: "Connections",
          help:
            "For each pair of things that have anything to do with each other, add a row. Skip pairs with no direct connection " +
            "(parts and timesheets are both connected THROUGH jobs — that\u2019s fine, the job rows capture it). " +
            "If you\u2019ve uploaded spreadsheets, suggested rows may already be here — confirm or correct them.",
          columns: [
            { key: "a", label: "Thing A" },
            { key: "b", label: "Thing B" },
            { key: "aHasB", label: "One A has how many B\u2019s? (one / many)" },
            { key: "bHasA", label: "One B has how many A\u2019s? (one / many)" },
            { key: "sentence", label: "Plain-English sentence", wide: true },
          ],
          example: [
            { a: "Customer", b: "Job", aHasB: "many", bHasA: "one", sentence: "A customer can have many jobs; each job is for one customer" },
          ],
        },
        {
          key: "exceptions",
          kind: "textarea",
          label: "\u201CUsually one, but sometimes\u2026\u201D",
          help:
            "You wrote \u201Cone\u201D, but is it ALWAYS one? One invoice per job — but have you ever split a big job into two invoices, or combined three small jobs onto one? " +
            "The exceptions count. If it has ever happened, or plausibly could, it\u2019s \u201Cmany\u201D.",
        },
        {
          key: "existAlone",
          kind: "textarea",
          label: "Can it exist alone?",
          help: "Can a job exist without a customer? A part without a supplier? An invoice before its job?",
        },
        {
          key: "connectionData",
          kind: "textarea",
          label: "Does the connection itself carry information?",
          help:
            "When a technician works a job, you might track their hours on that job or their role (lead vs. helper). " +
            "That info belongs to the CONNECTION, not to the tech or the job alone. List any connections like that and what you track about them.",
          example: "Job\u2194Part: quantity used, price charged on this job.",
        },
        {
          key: "connectionChanges",
          kind: "textarea",
          label: "Does the connection change over time?",
          help: "Can a job be reassigned to a different customer? A tech swapped mid-job? Do you need to know the old assignment afterward?",
        },
        {
          key: "sketch",
          kind: "textarea",
          label: "Optional: describe your boxes-and-lines sketch",
          help:
            "On paper, draw a box for each thing and a line for each connection, with \u201C1\u201D or \u201Cmany\u201D at each end. " +
            "Photograph it and send it with the packet — pen-on-napkin is a respected engineering format. Note here that you\u2019ve done it.",
        },
      ],
    },
    // ────────────────────────────────────────────────────────── 5
    {
      id: "dataDictionary",
      num: 5,
      title: "Data Dictionary",
      blurb:
        "List every individual piece of information you store, thing by thing. This is the most detailed worksheet — it becomes the literal blueprint for the database tables. Add one copy per thing on your master list; pull from your column inventories, then add fields hiding in notes columns, cell colors, and email.",
      time: "1\u20132 hours total",
      repeatable: true,
      instanceNoun: "thing",
      instanceLabelField: "entityName",
      fields: [
        {
          key: "entityName", kind: "text", label: "Thing",
          help: "e.g., \u201CJob\u201D — should match a row on your master list. Name the noun, not the spreadsheet: if the fields below came from \u201CBillingReport.xls\u201D, the thing is probably \u201CMember\u201D or \u201CPremium\u201D.",
        },
        {
          key: "source", kind: "text", label: "From spreadsheet (if imported)",
          help: "Filled in automatically when this table was seeded by an upload on the Import tab. Re-uploading the same file refreshes this copy.",
        },
        {
          key: "fields",
          kind: "table",
          label: "Fields",
          help:
            "One row per piece of information. Type: text / number / money / date / yes-no / choice-from-a-list / free-form notes. " +
            "If it\u2019s a choice, list ALL valid choices.",
          columns: [
            { key: "field", label: "Field" },
            { key: "meaning", label: "Meaning", wide: true },
            { key: "example", label: "Example" },
            { key: "required", label: "Required? (yes / no / eventually)" },
            { key: "type", label: "Type" },
            { key: "choices", label: "Choices (if a list)", wide: true },
            { key: "whoSets", label: "Who sets it?" },
          ],
          example: [
            {
              field: "Status", meaning: "where the job is in its life", example: "scheduled", required: "yes",
              type: "choice", choices: "quoted, accepted, scheduled, in progress, done, invoiced, paid, cancelled", whoSets: "Sarah",
            },
            { field: "Gate code", meaning: "access code for the property", example: "4412", required: "no", type: "text", choices: "", whoSets: "tech, after first visit" },
          ],
        },
        {
          key: "otherThing",
          kind: "textarea",
          label: "Cross-check: fields that describe a DIFFERENT thing",
          help:
            "\u201CCustomer phone\u201D in the Job table should just point at the customer — the number itself belongs in the Customer table, once. " +
            "List any field like that with an \u2192 arrow and the thing it really belongs to.",
        },
        {
          key: "calculated",
          kind: "textarea",
          label: "Cross-check: calculated fields",
          help:
            "Any field computed from other fields (job total = parts + labor; balance = invoiced \u2212 paid)? Write the formula. " +
            "Databases usually calculate these on the fly — but only if we know the formula.",
        },
        {
          key: "formatRules",
          kind: "textarea",
          label: "Cross-check: format rules",
          help:
            "Rules about what\u2019s valid, per field. Every rule you write here is a mistake the database will catch automatically instead of a human catching it three weeks later.",
          example: "Job numbers are always J- plus 4 digits. Discount can\u2019t exceed 20% without owner approval. Completion date can\u2019t be before start date.",
        },
        {
          key: "privacy",
          kind: "textarea",
          label: "Cross-check: privacy",
          help: "Sensitive fields — payment details, personal info, anything only certain people should see. Who should and shouldn\u2019t have access?",
        },
        {
          key: "missing",
          kind: "textarea",
          label: "Last question, most important: what do you currently NOT capture that bites you later?",
          help: "Recent moments where someone said \u201CI wish we\u2019d written down ______.\u201D That\u2019s a field that should exist on day one.",
        },
      ],
    },
  ],
};

/** Flat lookup: worksheet by id */
export function getWorksheet(id) {
  return PACKET.worksheets.find((w) => w.id === id);
}
