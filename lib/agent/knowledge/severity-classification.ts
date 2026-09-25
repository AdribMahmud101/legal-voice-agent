export type SeverityLevel = "emergency" | "high" | "priority" | "standard";

export interface SeverityClassification {
  severity: SeverityLevel;
  category: string;
  categoryBn: string;
  matchedTags: string[];
  matchedTagsBn: string[];
  factors: string[];
  legalBasis: string[];
  caseReference: string | null;
  needsApplicationConfirmation: boolean;
  acknowledgmentBn: string;
}

type SeverityRule = {
  tag: string;
  tagBn: string;
  category: string;
  categoryBn: string;
  severity: Exclude<SeverityLevel, "standard">;
  keywords: string[];
  factors: string[];
  legalBasis: string[];
  caseReference: string | null;
};

const SEVERITY_RULES: SeverityRule[] = [
  {
    tag: "Immediate_Safety_Concern",
    tagBn: "তাৎক্ষণিক নিরাপত্তা উদ্বেগ",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["নিরাপদ নেই", "নিরাপদ থাকতে পারছি না", "ঝুঁকিতে আছি", "ঝুঁকিতে আছে", "জরুরি সাহায্য দরকার", "এখনই সাহায্য দরকার", "প্রাণের ঝুঁকি", "আমাকে পিছু করছে"],
    factors: ["Immediate Physical Safety Risk"],
    legalBasis: ["Immediate safety and emergency escalation protocol"],
    caseReference: "Moyuri",
  },
  {
    tag: "Physical_Abuse",
    tagBn: "শারীরিক নির্যাতন",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["শারীরিক নির্যাতন", "মারধর", "মেরেছে", "মারছে", "আঘাত করেছে", "হুমকি দিয়েছে", "আঘাত"],
    factors: ["Immediate Physical Safety Risk", "Communication Constraints"],
    legalBasis: ["Domestic Violence (Prevention and Protection) Act, 2010"],
    caseReference: "Moyuri",
  },
  {
    tag: "Severe_Violence_NariOShishu",
    tagBn: "নারী বা শিশুর গুরুতর সহিংসতা",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["শিশু নির্যাতন", "শিশুকে নির্যাতন", "নারীর উপর নির্যাতন", "ধর্ষণ", "অপহরণ", "ধুয়ে নিয়ে", "গণড়ে"],
    factors: ["Immediate Physical Safety Risk", "Applicant Vulnerability & Isolation"],
    legalBasis: ["Nari O Shishu Nirjatan Daman Act, 2000"],
    caseReference: "Moyuri",
  },
  {
    tag: "Trafficking_Risk",
    tagBn: "মানব পাচারের ঝুঁকি",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["মানব পাচার", "পাচারের ঝুঁকি", "পাচার করা", "বাচ্চা পাচার", "ট্রাফিকিং"],
    factors: ["Immediate Physical Safety Risk", "Applicant Vulnerability & Isolation"],
    legalBasis: ["Human Trafficking Deterrence and Suppression Act, 2012"],
    caseReference: "Nabila",
  },
  {
    tag: "Confinement",
    tagBn: "জোর করে আটকে রাখা",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["আটকে রেখেছে", "আটকে রাখা", "বন্দী করে রেখেছে", "জোর করে রেখেছে", "কাটিয়ে রেখেছে", "আমাকে আটকে"],
    factors: ["Immediate Physical Safety Risk", "Communication Constraints"],
    legalBasis: ["Police or Magistrate Court escalation protocol"],
    caseReference: "Moyuri",
  },
  {
    tag: "Maintenance_Denial",
    tagBn: "ভরণপোষণ প্রত্যাখ্যান",
    category: "Family, Marriage & Financial Coercion",
    categoryBn: "পারিবারিক ও আর্থিক চাপ",
    severity: "high",
    keywords: ["ভরণপোষণ দিচ্ছে না", "ভরণপোষণ দেয় না", "ভরণপোষণ বন্ধ", "সন্তানের খরচ দিচ্ছে না", "ভরণপোষণের অভিযোগ"],
    factors: ["Applicant Vulnerability & Isolation", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Section 21B of the Legal Aid Services Act", "Family Courts Act, 2023"],
    caseReference: "Moyuri",
  },
  {
    tag: "Dowry_Demand",
    tagBn: "দেনমোহার দাবি বা চাপ",
    category: "Family, Marriage & Financial Coercion",
    categoryBn: "পারিবারিক ও আর্থিক চাপ",
    severity: "high",
    keywords: ["দেনমোহর চাই", "দেনমোহার চাপ", "যৌতুকের জন্য চাপ", "যৌতুক দিতে বলছে", "দেনমোহর দিতে বলছে"],
    factors: ["Applicant Vulnerability & Isolation", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Dowry Prohibition Act, 2018"],
    caseReference: "Moyuri",
  },
  {
    tag: "Child_Custody",
    tagBn: "সন্তানের হেফাজত বা custody",
    category: "Family, Marriage & Financial Coercion",
    categoryBn: "পারিবারিক ও আর্থিক চাপ",
    severity: "high",
    keywords: ["সন্তানের হেফাজত", "সন্তান নিয়ে বিবাদ", "সন্তান কার কাছে থাকবে", "custody", "হেফাজত নিয়ে"],
    factors: ["Applicant Vulnerability & Isolation", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Guardians and Wards Act, 1890"],
    caseReference: null,
  },
  {
    tag: "Divorce_Muslim_Law",
    tagBn: "মুসলিম বিবাহ বিচ্ছেদ",
    category: "Family, Marriage & Financial Coercion",
    categoryBn: "পারিবারিক ও আর্থিক চাপ",
    severity: "high",
    keywords: ["বিবাহ বিচ্ছেদ", "তালাক", "বিচ্ছেদ করতে", "সংসার ভেঙে", "স্বামীর সাথে আর থাকতে চাই না"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Muslim Family Laws Ordinance, 1961", "Dissolution of Muslim Marriages Act, 1939"],
    caseReference: null,
  },
  {
    tag: "Land_Grabbing_Forged_Deed",
    tagBn: "জমি দখল বা জাল দলিল",
    category: "Property, Land & Civil Disputes",
    categoryBn: "সম্পত্তি, ভূমি ও দেওয়ানি বিরোধ",
    severity: "high",
    keywords: ["জমি দখল", "জোর করে জমি", "জাল দলিল", "ভুয়া দলিল", "জমি কেড়ে", "সীমানা লঙ্ঘন"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Land Crime Prevention and Redress Act, 2023"],
    caseReference: "Abdul Malek",
  },
  {
    tag: "Civil_Injunction",
    tagBn: "সম্পত্তি বা দখল আইনে বাধা",
    category: "Property, Land & Civil Disputes",
    categoryBn: "সম্পত্তি, ভূমি ও দেওয়ানি বিরোধ",
    severity: "high",
    keywords: ["দখল ফেরত", "সম্পত্তি ফেরত", "ইনজাঙ্কশন", "সম্পত্তিতে হস্তক্ষেপ", "বাড়িতে ঢুকতে দিচ্ছে না"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Specific Relief Act, 1877"],
    caseReference: null,
  },
  {
    tag: "Property_Transfer_Dispute",
    tagBn: "সম্পত্তি হস্তান্তর বিরোধ",
    category: "Property, Land & Civil Disputes",
    categoryBn: "সম্পত্তি, ভূমি ও দেওয়ানি বিরোধ",
    severity: "high",
    keywords: ["জমি বিক্রি", "জমি হস্তান্তর", "জমি ধার", "জমি দান", "বাড়ি বিক্রি নিয়ে", "সম্পত্তি বিক্রি নিয়ে"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Transfer of Property Act, 1882"],
    caseReference: null,
  },
  {
    tag: "Inheritance_Succession",
    tagBn: "উত্তরাধিকার বা ওয়াসিয়ত বিরোধ",
    category: "Property, Land & Civil Disputes",
    categoryBn: "সম্পত্তি, ভূমি ও দেওয়ানি বিরোধ",
    severity: "high",
    keywords: ["উত্তরাধিকার", "ওয়াসিয়ত", "মৃত ব্যক্তির সম্পত্তি", "সম্পত্তির ভাগ", "উত্তরাধিকার বিরোধ"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Succession Act, 1925", "Partition Act, 1893"],
    caseReference: null,
  },
  {
    tag: "Labour_Dispute",
    tagBn: "শ্রম বা বেতন বিরোধ",
    category: "Labor, Cyber & Specialized Rights",
    categoryBn: "শ্রম, সাইবার ও বিশেষ অধিকার",
    severity: "high",
    keywords: ["বেতন পাইনি", "বেতন দিচ্ছে না", "বকেয়া বেতন", "কাজ থেকে চাকরিচ্যুত", "শ্রমিকের অধিকার", "কর্মঘাত", "ওভারটাইমের বেতন"],
    factors: ["Applicant Vulnerability & Isolation", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Bangladesh Labour Act, 2006, Section 33", "Labour Court"],
    caseReference: "Abdul Malek",
  },
  {
    tag: "Cyber_Harassment",
    tagBn: "সাইবার ব্ল্যাকমেইল বা অনলাইন নির্যাতন",
    category: "Labor, Cyber & Specialized Rights",
    categoryBn: "শ্রম, সাইবার ও বিশেষ অধিকার",
    severity: "high",
    keywords: ["ব্ল্যাকমেইল", "ফেসবুকে হয়রাজ", "ভুয়া ছবি", "ছবি ছড়াচ্ছে", "অনলাইনে ভয় দেখাচ্ছে", "সাইবার নির্যাতন", "ছবি অপব্যবহার"],
    factors: ["Immediate Physical Safety Risk", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Cyber Security Frameworks", "Cross-agency referral protocol"],
    caseReference: "Nabila",
  },
  {
    tag: "Cheque_Dishonour",
    tagBn: "চেক অনাদায়",
    category: "Labor, Cyber & Specialized Rights",
    categoryBn: "শ্রম, সাইবার ও বিশেষ অধিকার",
    severity: "high",
    keywords: ["চেক অনাদায়", "চেক ফেরত দেয়নি", "চেক bounce", "চেক দেন্ডার"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Negotiable Instruments Act, 1881, Section 138"],
    caseReference: null,
  },
  {
    tag: "Priority_Disability",
    tagBn: "প্রতিবন্ধিতা",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["প্রতিবন্ধী", "বিশেষ চাহিদা সম্পন্ন", "প্রতিবন্ধকতা রয়েছে", "শারীরিক প্রতিবন্ধকতা"],
    factors: ["Applicant Vulnerability & Isolation"],
    legalBasis: ["Rights and Protection of Persons with Disabilities Act, 2013"],
    caseReference: "Ripon",
  },
  {
    tag: "PWD_Visual",
    tagBn: "দৃষ্টিহীনতা",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["দৃষ্টিহীন", "দৃষ্টিশক্তি নেই", "অন্ধ", "দেখতে পাই না", "voice only"],
    factors: ["Applicant Vulnerability & Isolation"],
    legalBasis: ["Rights and Protection of Persons with Disabilities Act, 2013"],
    caseReference: "Ripon",
  },
  {
    tag: "Restricted_Contact",
    tagBn: "সীমিত যোগাযোগের সুযোগ",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["শুধু শুক্রবার", "নিরাপদ সময়ে", "গোপন রাখতে হবে", "সতর্ক করবেন না", "ফোন ধরা যায় না", "সংকেতে যোগাযোগ"],
    factors: ["Communication Constraints", "Applicant Vulnerability & Isolation"],
    legalBasis: ["Zero-Outbound SMS lock and discreet callback protocol"],
    caseReference: "Moyuri",
  },
  {
    tag: "Proxy_Applicant",
    tagBn: "প্রতিনিধির মাধ্যমে আবেদন",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["আমার হয়ে আবেদন", "প্রতিনিধির মাধ্যমে", "আমার মেয়ের হয়ে", "অন্য কেউ আমার হয়ে", "proxy applicant"],
    factors: ["Applicant Vulnerability & Isolation"],
    legalBasis: ["Proxy representation and subsequent direct verification protocol"],
    caseReference: "Ripon",
  },
  {
    tag: "Incomplete_NID",
    tagBn: "পরিচয়পত্র অসম্পূর্ণ",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["এনআইডি নেই", "পরিচয়পত্র নেই", "এনআইডি হারিয়েছে", "NID missing", "পরিচয়পত্র অপ্রাপ্য"],
    factors: ["Applicant Vulnerability & Isolation"],
    legalBasis: ["Defer strict identity requirements for vulnerable citizens"],
    caseReference: "Moyuri",
  },
  {
    tag: "Case_Access_Barrier",
    tagBn: "ভাষা বা সংযোগের বাধা",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["মারমা ভাষা", "ভাষা বোঝা যায় না", "ইন্টারনেট সংযোগ নেই", "ইন্টারনেট কাজ করছে না", "অফলাইন আছি", "কম ইন্টারনেট", "যোগাযোগ কঠিন"],
    factors: ["Applicant Vulnerability & Isolation", "Communication Constraints"],
    legalBasis: ["Offline-first and provenance-aware intake protocol"],
    caseReference: "Nuching Marma",
  },
  {
    tag: "Case_Delay_Or_Inactivity",
    tagBn: "কেসের দেরি বা আইনজীবীর নিষ্ক্রিয়তা",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "high",
    keywords: ["সাত মাস ধরে", "শুনানির আপডেট নেই", "উকিল ফোন ধরে না", "আইনজীবী ফোন ধরে না", "মামলার কোনো আপডেট নেই", "দীর্ঘদিন অপেক্ষায়"],
    factors: ["Legal Merit & Time Sensitivity", "Communication Constraints"],
    legalBasis: ["Low-bandwidth case status and lawyer-change escalation protocol"],
    caseReference: "Abdul Malek",
  },
];

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  standard: 0,
  priority: 1,
  high: 2,
  emergency: 3,
};

const FACTOR_DEFINITIONS: Record<string, string> = {
  "Immediate Physical Safety Risk":
    "চলমান সহিংসতা, হুমকি, সন্তান বা অন্য কারও তাৎক্ষণিক ঝুঁকি।",
  "Applicant Vulnerability & Isolation":
    "প্রতিনিধির মাধ্যমে আবেদন, শারীরিক বা মানসিক প্রতিবন্ধিতা, আর্থিক বা সামাজিক বিচ্ছিন্নতা।",
  "Communication Constraints":
    "পরিবার বা নিরাপত্তা পরিস্থিতির কারণে নির্দিষ্ট সময়ে যোগাযোগের সুযোগ।",
  "Legal Merit & Time Sensitivity":
    "সময়সীমা, শুনানি, সীমা মেয়াদ, সাক্ষ্য বা অধিকার সুরক্ষার সময়-সংবেদনশীল বিষয়।",
};

const CASE_KNOWLEDGE = [
  "Moyuri: ongoing physical safety risk, restricted contact, inaccessible NID, and a proxy report require discreet handling and zero-outbound alerts.",
  "Ripon: visually impaired proxy representation requires voice-based accessible intake and clear authority boundaries.",
  "Nabila: rapidly spreading fake images and sensitive digital evidence require role-restricted access and tracked cross-agency referral.",
  "Nuching Marma: language barriers and unreliable connectivity require offline-first, provenance-aware intake and later synchronization.",
  "Abdul Malek: a stagnant case, financial travel burden, unstable contact, and lawyer inactivity require a low-bandwidth status route and lawyer-change alert.",
];

function normalizeText(input: string): string {
  return input.toLocaleLowerCase("bn-BD").replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function hasPersonalProblemContext(text: string): boolean {
  return (
    /(আমার|আমাকে|আমাদের|আমি\s+(দৃষ্টিহীন|প্রতিবন্ধী|মারমা|ভাষা|কাছে|থাকা|করছে|হয়েছে|চাই|চাইছি))/.test(text) ||
    /(হয়েছে|হচ্ছে|ঘটেছে|ঘটে|সমস্যা|অভিযোগ|বিপদে|চাপে|কাছে|আটকে|মারছে|মেরেছে|পাইনি|দিচ্ছে না|দেয় না|নেই|চাই|চাইছে|চায়|শুধু|নিরাপদ|গোপন|সংকেত|ভাষা|ইন্টারনেট|আপডেট)/.test(text)
  );
}

function hasCrisisContext(text: string): boolean {
  return /(এখন|এখনই|জরুরি|বিপদে|আটকে|মারছে|মেরেছে|হুমকি|প্রাণ|অপহরণ|নির্যাতন|চাপ দিচ্ছে)/.test(text);
}

function highestSeverity(rules: SeverityRule[]): SeverityLevel {
  return rules.reduce<SeverityLevel>(
    (current, rule) => (SEVERITY_RANK[rule.severity] > SEVERITY_RANK[current] ? rule.severity : current),
    "standard",
  );
}

function buildAcknowledgment(severity: SeverityLevel, categoryBn: string, tagsBn: string[]): string {
  const tagText = tagsBn.slice(0, 2).join(" এবং ");
  const safetyText =
    severity === "emergency"
      ? "আপনার নিরাপত্তা সবার আগে; প্রয়োজনে ৯৯৯, ১০৯ বা ১৬৬৯৯ নম্বরে কল করুন।"
      : "আইনি সহায়তার জন্য আপনার অভিযোগটি নথিভুক্ত করলে যাচাই ও পরবর্তী পদক্ষেপ নেওয়া যাবে।";
  return `আপনার বর্ণনায় ${tagText} শনাক্ত হয়েছে। এটি ${categoryBn} হিসেবে উচ্চ অগ্রাধিকারের বিষয়; ${safetyText} আপনি কি এই সমস্যার জন্য আইনি সহায়তা আবেদন ও অভিযোগ নথিভুক্ত করতে চান? হ্যাঁ অথবা না বলুন।`;
}

export function classifySeverity(input: string): SeverityClassification {
  const text = normalizeText(input);
  const matched = SEVERITY_RULES.filter((rule) => rule.keywords.some((keyword) => text.includes(normalizeText(keyword))));
  const personalContext = hasPersonalProblemContext(text);
  const crisisContext = hasCrisisContext(text);
  const relevant = matched.filter((rule) => {
    if (rule.severity === "emergency") return crisisContext && personalContext;
    return personalContext;
  });

  if (relevant.length === 0) {
    return {
      severity: "standard",
      category: "General Inquiry",
      categoryBn: "সাধারণ তথ্য",
      matchedTags: [],
      matchedTagsBn: [],
      factors: [],
      legalBasis: [],
      caseReference: null,
      needsApplicationConfirmation: false,
      acknowledgmentBn: "",
    };
  }

  const severity = highestSeverity(relevant);
  const matchedTags = relevant.map((rule) => rule.tag);
  const matchedTagsBn = relevant.map((rule) => rule.tagBn);
  const category = relevant[0].category;
  const categoryBn = relevant[0].categoryBn;
  const factors = Array.from(new Set(relevant.flatMap((rule) => rule.factors)));
  const legalBasis = Array.from(new Set(relevant.flatMap((rule) => rule.legalBasis)));
  const caseReference = relevant.find((rule) => rule.caseReference)?.caseReference ?? null;

  return {
    severity,
    category,
    categoryBn,
    matchedTags,
    matchedTagsBn,
    factors,
    legalBasis,
    caseReference,
    needsApplicationConfirmation: true,
    acknowledgmentBn: buildAcknowledgment(severity, categoryBn, matchedTagsBn),
  };
}

export function getSeverityClassificationKnowledgeBlock(): string {
  const taxonomy = SEVERITY_RULES.map(
    (rule) =>
      `${rule.tag}: ${rule.tagBn}; category=${rule.category}; screening_level=${rule.severity}; factors=${rule.factors.join(", ")}; legal_basis=${rule.legalBasis.join(", ")}`,
  ).join("\n");
  const factors = Object.entries(FACTOR_DEFINITIONS)
    .map(([name, meaning]) => `${name}: ${meaning}`)
    .join("\n");
  return `[Severity Screening Knowledge Base]
The following taxonomy is a screening aid, not a final legal or eligibility decision. A human DLAO must confirm the facts.
${taxonomy}
[Priority factors]
${factors}
[Case-informed operating principles]
${CASE_KNOWLEDGE.join("\n")}
[Application routing]
When a caller describes a personal matter matching a non-standard severity tag, acknowledge the matching category and relevant factors, then ask whether the caller wants to proceed with a legal-aid problem application. If the caller says yes, move to the problem intake phase. If no, acknowledge the choice and invite another general question. Never auto-file, auto-reject, invent facts, or expose internal tag names to the caller.`;
}

export function getSeverityFactorsMeaning(): Record<string, string> {
  return { ...FACTOR_DEFINITIONS };
}
