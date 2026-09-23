/**
 * The competency catalogue.
 *
 * This is the one file you tune. Jev never invents a dimension: it selects from
 * this list (`requirement`, asked about the job ad) and then rates the resume
 * against the matching rubric (`levels`, asked about the resume).
 *
 * `levels` must be ordered weakest -> strongest, and every level has to describe
 * a concrete situation that stands on its own — Jev reads them without seeing
 * the dimension's label or id.
 */

export type Dimension = {
  id: string;
  label: string;
  /** Yes/no question asked about the JOB AD, to decide if this matters for the role. */
  requirement: string;
  /** Ordered rubric asked about the RESUME. Exactly 5 levels, index 0..4. */
  levels: readonly [string, string, string, string, string];
};

export const DIMENSIONS: readonly Dimension[] = [
  {
    id: "programming",
    label: "Software engineering",
    requirement:
      "This role requires the person to write and maintain production code themselves.",
    levels: [
      "No programming work of any kind appears in this resume",
      "Programming languages are listed as skills, but no work using them is described",
      "Wrote code as part of specific projects, with some detail about what was built",
      "Programming was the primary day-to-day activity across multiple roles or projects",
      "Owned substantial production codebases, with evidence of design decisions, performance work, or tooling others depend on",
    ],
  },
  {
    id: "data_analysis",
    label: "Data analysis",
    requirement:
      "This role requires analysing data to produce findings, metrics, or recommendations.",
    levels: [
      "No analytical work with data is described",
      "Mentions working with reports or data, without describing any analysis performed",
      "Ran specific analyses and described what the data showed",
      "Analysis was a core responsibility, with named techniques and recurring deliverables",
      "Led analytical work that changed decisions, with evidence of methodology choices and measured impact",
    ],
  },
  {
    id: "sql_querying",
    label: "SQL and data querying",
    requirement:
      "This role requires querying databases or warehouses directly, for example with SQL.",
    levels: [
      "No database or query work appears",
      "SQL or a database is named in a skills list only",
      "Wrote queries to pull data for specific pieces of work",
      "Routinely worked in warehouses or databases as a core part of the job",
      "Built and optimised complex query logic others relied on, including performance or modelling decisions",
    ],
  },
  {
    id: "machine_learning",
    label: "Machine learning / AI",
    requirement:
      "This role requires building, training, or applying machine learning or AI models.",
    levels: [
      "No machine learning or AI work is described",
      "ML or AI topics appear as interests, coursework, or skill keywords only",
      "Built or applied models on specific projects, with the problem described",
      "Modelling was a primary responsibility across multiple projects",
      "Owned models in production, with evidence of evaluation, iteration, and measured business outcomes",
    ],
  },
  {
    id: "data_engineering",
    label: "Data engineering",
    requirement:
      "This role requires building or maintaining data pipelines, warehouses, or ETL processes.",
    levels: [
      "No pipeline or data infrastructure work appears",
      "Data tools are listed, but no pipeline work is described",
      "Built or maintained specific pipelines or data flows",
      "Pipeline and warehouse work was a core, ongoing responsibility",
      "Designed data platforms or architectures that multiple teams depend on",
    ],
  },
  {
    id: "cloud_infra",
    label: "Cloud and infrastructure",
    requirement:
      "This role requires working with cloud platforms, deployment, or infrastructure.",
    levels: [
      "No cloud or infrastructure work appears",
      "Cloud platforms are named in a skills list only",
      "Used cloud services to deliver specific projects",
      "Cloud infrastructure was a regular part of the role, including deployment or configuration",
      "Owned infrastructure design, cost, or reliability for significant systems",
    ],
  },
  {
    id: "system_design",
    label: "Architecture and system design",
    requirement:
      "This role requires designing systems or technical architecture, not just implementing them.",
    levels: [
      "No design or architecture responsibility is described",
      "Participated in technical discussions without owning design decisions",
      "Designed components or modules within a larger system",
      "Owned the architecture of a significant system end to end",
      "Set architectural direction across multiple systems, teams, or domains",
    ],
  },
  {
    id: "product_management",
    label: "Product ownership",
    requirement:
      "This role requires owning a product, roadmap, or feature prioritisation.",
    levels: [
      "No product ownership appears",
      "Contributed to products built by others, without owning direction",
      "Owned specific features or a defined part of a product",
      "Owned a product area including roadmap and prioritisation decisions",
      "Set product strategy with evidence of measured outcomes and trade-offs made",
    ],
  },
  {
    id: "project_delivery",
    label: "Project delivery",
    requirement:
      "This role requires running projects to scope, budget, or deadlines.",
    levels: [
      "No project delivery responsibility appears",
      "Worked on projects run by other people",
      "Ran specific projects with defined scope and timelines",
      "Delivery was a core responsibility across multiple concurrent projects",
      "Ran large or complex programmes, with evidence of managing scope, risk, and competing demands",
    ],
  },
  {
    id: "people_leadership",
    label: "People leadership",
    requirement:
      "This role requires managing people with direct reports.",
    levels: [
      "No management responsibility is described",
      "Informal leadership such as mentoring or acting as a technical lead",
      "Led a small team or was responsible for a project team",
      "Managed a team with direct reports, including performance responsibility",
      "Managed multiple teams, managers, or a function, including hiring and structure",
    ],
  },
  {
    id: "mentoring",
    label: "Mentoring and capability building",
    requirement:
      "This role requires developing the skills of others, formally or informally.",
    levels: [
      "No mentoring or development of others appears",
      "Worked alongside others without any described development responsibility",
      "Mentored individuals or onboarded new team members",
      "Capability building was an explicit part of the role",
      "Built development programmes or lifted capability across a team or organisation",
    ],
  },
  {
    id: "stakeholder_management",
    label: "Senior stakeholder management",
    requirement:
      "This role requires working with and influencing senior or executive stakeholders.",
    levels: [
      "No stakeholder interaction is described",
      "Worked mainly within an immediate team",
      "Worked directly with stakeholders outside the immediate team",
      "Regularly engaged senior stakeholders as a core part of the role",
      "Influenced executive or board-level decisions, with evidence of what changed as a result",
    ],
  },
  {
    id: "client_consulting",
    label: "Client and consulting work",
    requirement:
      "This role requires advising external clients or working in a consulting capacity.",
    levels: [
      "No external client work appears",
      "Internal roles only, with no client-facing responsibility",
      "Worked with external clients on specific engagements",
      "Client advisory was a core, ongoing responsibility",
      "Owned client relationships end to end, including scoping, delivery, and commercial outcomes",
    ],
  },
  {
    id: "written_communication",
    label: "Written communication",
    requirement:
      "This role requires producing written documents, reports, or documentation.",
    levels: [
      "No written deliverables are mentioned, and the resume itself is unclear or poorly structured",
      "The resume is readable but describes no written work products",
      "Produced specific written deliverables such as reports or documentation",
      "Writing was a regular and named part of the role",
      "Authored publications, standards, or widely used documentation, or writes with notable clarity throughout this resume",
    ],
  },
  {
    id: "presenting_facilitation",
    label: "Presenting and facilitation",
    requirement:
      "This role requires presenting, facilitating workshops, or teaching groups.",
    levels: [
      "No presenting or facilitation appears",
      "Attended or contributed to sessions run by others",
      "Presented to groups or ran specific sessions",
      "Presenting or facilitating was a regular part of the role",
      "Delivered to large or senior audiences regularly, such as conferences or executive forums",
    ],
  },
  {
    id: "teaching_curriculum",
    label: "Training and curriculum design",
    requirement:
      "This role requires designing training content, courses, or curriculum.",
    levels: [
      "No training or course design appears",
      "Delivered content designed by other people",
      "Designed specific training sessions or materials",
      "Course and curriculum design was a core responsibility",
      "Built full programmes used across organisations, with evidence of learner outcomes",
    ],
  },
  {
    id: "commercial_acumen",
    label: "Commercial acumen",
    requirement:
      "This role requires understanding of revenue, cost, pricing, or business performance.",
    levels: [
      "No commercial context appears",
      "Worked in a business setting without describing commercial responsibility",
      "Work is connected to specific business outcomes such as cost or revenue",
      "Commercial results were an explicit responsibility",
      "Owned P&L, pricing, or budget decisions with quantified results",
    ],
  },
  {
    id: "sales_bd",
    label: "Sales and business development",
    requirement:
      "This role requires selling, developing pipeline, or winning new business.",
    levels: [
      "No sales or business development appears",
      "Supported sales activity run by others",
      "Contributed directly to winning specific work or accounts",
      "Pipeline and revenue generation were core responsibilities",
      "Owned significant revenue targets with quantified results against them",
    ],
  },
  {
    id: "marketing",
    label: "Marketing and growth",
    requirement:
      "This role requires marketing, audience growth, or campaign work.",
    levels: [
      "No marketing activity appears",
      "Adjacent to marketing without owning any of it",
      "Ran specific campaigns or content initiatives",
      "Marketing or growth was a core responsibility",
      "Owned marketing strategy with measured growth outcomes",
    ],
  },
  {
    id: "design_ux",
    label: "Design and user experience",
    requirement:
      "This role requires design, user experience, or visual craft.",
    levels: [
      "No design work appears",
      "Design tools are listed without described work",
      "Produced specific designs or interfaces",
      "Design was a core, ongoing responsibility",
      "Owned design direction, systems, or research-led design decisions",
    ],
  },
  {
    id: "domain_regulated",
    label: "Regulated industry experience",
    requirement:
      "This role sits in a regulated industry such as financial services, healthcare, or government.",
    levels: [
      "No regulated industry experience appears",
      "Worked in industries with no particular regulatory weight",
      "Spent time in a regulated industry without describing regulatory work",
      "Worked within regulatory or compliance constraints as part of the job",
      "Deep regulated-sector experience, including specific frameworks or obligations",
    ],
  },
  {
    id: "change_management",
    label: "Change and adoption",
    requirement:
      "This role requires driving organisational change or adoption of new ways of working.",
    levels: [
      "No change or adoption work appears",
      "Worked through changes led by other people",
      "Drove adoption of specific tools or processes",
      "Change and adoption were explicit responsibilities",
      "Led organisation-wide change with evidence of sustained adoption",
    ],
  },
  {
    id: "governance_risk",
    label: "Governance, risk, and quality",
    requirement:
      "This role requires governance, risk management, quality assurance, or controls.",
    levels: [
      "No governance or quality responsibility appears",
      "Followed processes defined by others",
      "Contributed to specific controls, testing, or review processes",
      "Governance or quality was a core responsibility",
      "Designed governance frameworks or owned risk at an organisational level",
    ],
  },
  {
    id: "research",
    label: "Research",
    requirement:
      "This role requires original research or rigorous investigation.",
    levels: [
      "No research work appears",
      "Academic study without described research output",
      "Conducted research on specific questions or projects",
      "Research was a core responsibility with regular output",
      "Published or led original research that others build on",
    ],
  },
  {
    id: "cybersecurity",
    label: "Security and compliance posture",
    requirement:
      "This role requires identifying security risks, securing applications or systems, or maintaining compliance standards.",
    levels: [
      "No security, privacy, or compliance work appears",
      "Security tools or certifications are listed without described work",
      "Implemented security fixes, controls, or basic vulnerability remediations",
      "Security was a recurring responsibility, including threat modeling, audits, or incident response",
      "Owned end-to-end security architecture, compliance programs, or enterprise risk posture",
    ],
  },
  {
    id: "devops_sre",
    label: "DevOps and site reliability",
    requirement:
      "This role requires managing CI/CD pipelines, release processes, or system reliability and uptime.",
    levels: [
      "No DevOps, release, or reliability work appears",
      "CI/CD or deployment tools are named in a skills list only",
      "Maintained builds or configured deployment workflows for specific services",
      "DevOps and deployment automation were a core, regular responsibility",
      "Owned site reliability, SLOs/SLAs, incident response, or automated release platforms across multiple systems",
    ],
  },
  {
    id: "qa_automation",
    label: "Testing and quality assurance",
    requirement:
      "This role requires designing, writing, or managing automated test suites and quality engineering.",
    levels: [
      "No testing or quality assurance work appears",
      "Testing frameworks are listed in skills without described test suites",
      "Wrote unit, integration, or end-to-end tests for specific features",
      "Testing and test automation were a primary, continuous responsibility",
      "Architected test automation frameworks or quality strategies adopted across engineering teams",
    ],
  },
  {
    id: "frontend_development",
    label: "Frontend engineering",
    requirement:
      "This role requires building browser-based user interfaces, web applications, or frontend client code.",
    levels: [
      "No frontend or browser interface work appears",
      "Frontend frameworks are listed in skills, but no interface work is described",
      "Built user interfaces and pages for specific features or projects",
      "Frontend development was a primary day-to-day focus across multiple projects",
      "Architected complex web applications, design systems, or high-performance frontend codebases",
    ],
  },
  {
    id: "mobile_development",
    label: "Mobile app development",
    requirement:
      "This role requires developing native or cross-platform mobile apps for iOS or Android.",
    levels: [
      "No mobile application work appears",
      "Mobile platforms or SDKs are listed in skills without described app work",
      "Built features within an existing mobile application",
      "Mobile app development was a core ongoing responsibility",
      "Owned mobile apps end-to-end, from architecture and performance to app store releases",
    ],
  },
  {
    id: "api_integrations",
    label: "API design and integration",
    requirement:
      "This role requires designing, building, or integrating REST, GraphQL, or third-party web services.",
    levels: [
      "No API or integration work appears",
      "API tools or protocols are named in skills only",
      "Consumed or built specific API endpoints for a project",
      "Designed and built APIs or integrated external services as a core responsibility",
      "Owned API platforms, contracts, and integrations used by external partners or multiple engineering teams",
    ],
  },
  {
    id: "genai_llms",
    label: "Generative AI and LLM solutions",
    requirement:
      "This role requires building, evaluating, or deploying generative AI models, LLMs, or agentic workflows.",
    levels: [
      "No generative AI or LLM work appears",
      "GenAI tools or prompt engineering are listed as interests or skills only",
      "Built prototypes or features using LLM APIs or prompt workflows",
      "Building and evaluating LLM-powered applications was a core responsibility",
      "Architected production LLM systems, evaluation benchmarks, or complex multi-agent architectures in production",
    ],
  },
  {
    id: "bi_visualization",
    label: "Business intelligence and dashboards",
    requirement:
      "This role requires building interactive dashboards, data visualisations, or BI reporting suites.",
    levels: [
      "No dashboard or BI work appears",
      "BI tools such as Tableau or Power BI appear only in a skills list",
      "Built specific dashboards or charts for a project or team",
      "Dashboard creation and BI reporting were core, recurring responsibilities",
      "Designed enterprise-wide BI semantic layers, reporting standards, or executive visualisations",
    ],
  },
  {
    id: "user_research",
    label: "User research and usability",
    requirement:
      "This role requires conducting user research, usability testing, or customer discovery interviews.",
    levels: [
      "No user research or usability testing appears",
      "Attended research sessions or read research summaries without running them",
      "Conducted specific user interviews, usability tests, or feedback surveys",
      "User research and discovery were core, ongoing responsibilities",
      "Designed and led strategic research initiatives that redefined product direction or user journeys",
    ],
  },
  {
    id: "agile_coaching",
    label: "Agile delivery and scrum",
    requirement:
      "This role requires facilitating agile practices, scrum ceremonies, or sprint planning.",
    levels: [
      "No agile ceremony or sprint facilitation appears",
      "Participated in agile ceremonies run by others without facilitating",
      "Facilitated standups, retrospectives, or sprint planning for a team",
      "Agile facilitation and sprint workflow management were explicit responsibilities",
      "Coached multiple teams or organisations in agile methodologies and delivery improvements",
    ],
  },
  {
    id: "operations_process",
    label: "Operations and process improvement",
    requirement:
      "This role requires designing, streamlining, or scaling operational workflows and business processes.",
    levels: [
      "No operational or process improvement work appears",
      "Followed standard operating procedures without modifying them",
      "Streamlined specific operational workflows or procedures",
      "Process design and operational efficiency were primary responsibilities",
      "Designed and scaled organisation-wide operating models or continuous improvement initiatives",
    ],
  },
  {
    id: "customer_success",
    label: "Customer success and retention",
    requirement:
      "This role requires managing customer relationships, onboarding, account retention, or client satisfaction.",
    levels: [
      "No post-sales customer management appears",
      "Answered customer inquiries reactively without account ownership",
      "Managed onboarding or ongoing relationships for specific customer accounts",
      "Customer retention, health, and renewals were core responsibilities",
      "Owned customer success strategy, churn reduction, or enterprise customer advocacy across a portfolio",
    ],
  },
  {
    id: "financial_modeling",
    label: "Financial analysis and budgeting",
    requirement:
      "This role requires financial modelling, forecasting, budgeting, or unit economics analysis.",
    levels: [
      "No financial analysis or budgeting appears",
      "Handled project receipts or invoice processing only",
      "Built specific budgets, financial models, or cost-benefit forecasts",
      "Financial planning, variance analysis, and modelling were regular responsibilities",
      "Owned corporate budgeting, P&L forecasting, or complex valuation and pricing models",
    ],
  },
  {
    id: "hiring_recruiting",
    label: "Interviewing and talent acquisition",
    requirement:
      "This role requires interviewing, evaluating, or recruiting candidates for hire.",
    levels: [
      "No interviewing or hiring involvement appears",
      "Participated as a secondary interviewer without assessing independently",
      "Conducted interviews and evaluated candidates for specific roles",
      "Hiring, candidate screening, and interviewing were regular responsibilities",
      "Built hiring rubrics, scaled team headcount, or designed technical interview processes",
    ],
  },
  {
    id: "vendor_management",
    label: "Vendor and partner management",
    requirement:
      "This role requires sourcing, evaluating, negotiating with, or managing external vendors and suppliers.",
    levels: [
      "No vendor or supplier management appears",
      "Used third-party vendor tools without managing the relationship",
      "Managed day-to-day coordination with specific external vendors",
      "Vendor selection, contract evaluation, and SLA tracking were core responsibilities",
      "Owned vendor procurement strategy, contract negotiations, and enterprise partnerships",
    ],
  },
  {
    id: "cross_functional",
    label: "Cross-functional coordination",
    requirement:
      "This role requires aligning and coordinating initiatives across multiple distinct business functions.",
    levels: [
      "Work was confined strictly within a single team",
      "Interacted with other teams occasionally without driving shared outcomes",
      "Coordinated cross-functional work on specific projects or launches",
      "Leading cross-functional alignment was a continuous day-to-day responsibility",
      "Unified divergent stakeholders across engineering, product, commercial, and operations to deliver strategic goals",
    ],
  },
] as const;

export const DIMENSION_BY_ID = new Map(DIMENSIONS.map((d) => [d.id, d]));

/** Number of rubric levels; used to normalise a raw Jev score into 0..1. */
export const LEVELS = 5;
export const MAX_SCORE = LEVELS - 1;

/** Seniority ladder, used for the required-vs-demonstrated comparison. */
export const SENIORITY = {
  entry: "Entry level or graduate: little to no prior professional experience expected",
  early:
    "Early career: a few years of experience, works on defined tasks with support",
  mid: "Mid level: works independently and owns meaningful pieces of work",
  senior:
    "Senior: owns significant scope, sets direction for their area, guides others",
  lead: "Lead or principal: sets direction across teams, recognised depth of expertise",
  executive:
    "Executive: accountable for a function, department, or organisation",
} as const;

export type SeniorityLevel = keyof typeof SENIORITY;

export const SENIORITY_ORDER: readonly SeniorityLevel[] = [
  "entry",
  "early",
  "mid",
  "senior",
  "lead",
  "executive",
];

/**
 * Talent profiles. Asked twice against different state: once of the job ad
 * ("who is this role hiring?") and once of the resume ("who does this person
 * read as?"). Code compares the two — a mismatch is one of the most useful
 * things a candidate can learn, and neither question alone reveals it.
 *
 * The engineering entries are adapted from the TypeSafe playground example;
 * the rest extend the same idea to the non-engineering roles this catalogue
 * covers.
 */
export const TALENT_PROFILES = {
  frontend_engineer:
    "Builds user-facing interfaces: React, Vue, or Angular work, design systems, browser performance, accessibility. Consumes APIs but does not own them.",
  backend_engineer:
    "Builds server-side services, APIs, and data models. Owns business logic, databases, queues, and service performance. Little or no UI work.",
  full_stack_engineer:
    "Ships both UI and services on the same projects with neither side dominant. Not a backend engineer who occasionally edited a template.",
  mobile_engineer:
    "Builds iOS, Android, or cross-platform apps: app store releases, device performance, native SDKs.",
  devops_infrastructure:
    "Owns how code runs and ships: CI/CD, Kubernetes, Terraform, cloud infrastructure, monitoring, reliability and on-call.",
  data_engineer:
    "Builds pipelines and data platforms: ETL, warehouses, Spark, Airflow, dbt, streaming. Serves analysts and models rather than end users.",
  data_analyst:
    "Answers business questions with data: SQL, dashboards, reporting, experiment readouts. Communicates findings to decision-makers rather than shipping systems.",
  ml_ai_engineer:
    "Trains, fine-tunes, evaluates, or serves models. Includes applied ML, LLM, and research engineering.",
  security_engineer:
    "Application, cloud, or product security: threat modelling, penetration testing, detection engineering, identity, vulnerability remediation.",
  embedded_systems:
    "Low-level work: firmware, drivers, kernels, compilers, robotics, or hardware-constrained C, C++, and Rust.",
  product_manager:
    "Owns what gets built and why: roadmap, prioritisation, discovery, success metrics. Works through engineers rather than shipping code.",
  designer:
    "Owns how the product looks and works for users: interface design, design systems, user research, prototyping.",
  consultant_advisor:
    "Advises external clients: scoping engagements, diagnosis, recommendations, and handover. Breadth across clients rather than depth in one product.",
  trainer_educator:
    "Builds capability in others: course and curriculum design, workshop facilitation, teaching, enablement programmes.",
  manager_leader:
    "Leads people and functions: hiring, performance, structure, and strategy. Technical background may exist but is no longer the main contribution.",
  commercial_gtm:
    "Revenue-facing work: sales, business development, partnerships, marketing, or growth.",
  qa_test_engineer:
    "Owns software quality and testing: automated test frameworks, regression suites, performance testing, bug triaging.",
  customer_success_manager:
    "Owns customer retention and outcomes: onboarding, account health, renewals, support escalation, customer advocacy.",
  operations_specialist:
    "Owns business workflows, logistics, and process efficiency: internal tooling, operational cadence, execution scaling.",
  other:
    "Real professional work that fits none of the above.",
} as const;

export type TalentProfile = keyof typeof TALENT_PROFILES;

/** Career-progression shapes. Adapted from the playground example. */
export const CAREER_PROGRESSION = {
  steady_growth: "Clear progression with increasing seniority and scope",
  lateral_moves: "Similar level roles at different organisations",
  job_hopping: "Frequent changes with short tenure in each role",
  long_tenure: "Long time in one organisation, with limited visible role change",
  unclear: "The progression pattern cannot be determined from the resume",
} as const;

export type CareerProgression = keyof typeof CAREER_PROGRESSION;

/**
 * Years of professional experience. A Score rather than a Choice because the
 * levels are ordered, so a probability-weighted answer between two levels is
 * meaningful. Today's date goes in the question's structured instructions —
 * Jev has no clock, and asking it to reason from weights about "now" would be
 * exactly the kind of thing the docs warn against.
 */
export const EXPERIENCE_BANDS = [
  "No professional experience",
  "About 2 years",
  "About 4 years",
  "About 6 years",
  "About 8 years",
  "10 or more years",
] as const;
