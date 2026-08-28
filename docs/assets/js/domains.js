/* Single source of truth for the CompTIA Security+ SY0-701 domains and exam format.
   Aligned with the official CompTIA Security+ SY0-701 Exam Objectives (V7.0).
   Consumed by index.html, questions/, concepts/ and exam/.
   Owns and exports window.SECPLUS: { DOMAINS, EXAM, ids, byId }. */
(function () {
  // Per-question external study links point to Professor Messer + YouTube (see messer.js /
  // messer-q.js). Canonical-source homepages are intentionally omitted: there is no stable
  // per-topic deep link tie-able to a question; NIST/OWASP would need a curated table (left
  // as optional enrichment).
  const DOMAINS = [
    { id: '1.0', nameEn: 'General Security Concepts',                     namePt: 'Conceitos Gerais de Segurança',            weight: 12 },
    { id: '2.0', nameEn: 'Threats, Vulnerabilities, and Mitigations',     namePt: 'Ameaças, Vulnerabilidades e Mitigações',   weight: 22 },
    { id: '3.0', nameEn: 'Security Architecture',                         namePt: 'Arquitetura de Segurança',                 weight: 18 },
    { id: '4.0', nameEn: 'Security Operations',                           namePt: 'Operações de Segurança',                   weight: 28 },
    { id: '5.0', nameEn: 'Security Program Management and Oversight',      namePt: 'Gestão e Governança do Programa de Segurança', weight: 20 },
  ];
  const EXAM = {
    code: 'SY0-701',
    maxQuestions: 90,
    minutes: 90,
    passingScore: 750,
    scaleMin: 100,
    scaleMax: 900,
    types: 'Múltipla escolha + baseadas em desempenho (PBQ)',
    releaseDate: '07/11/2023',
    validityYears: 3,
  };
  window.SECPLUS = {
    DOMAINS: DOMAINS,
    EXAM: EXAM,
    ids: DOMAINS.map(function (d) { return d.id; }),
    byId: DOMAINS.reduce(function (acc, d) { acc[d.id] = d; return acc; }, {}),
  };
})();
