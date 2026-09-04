const PATTERNS: RegExp[] = [
  /\b(race|racial|ethnicity|ethnic|caucasian|african[- ]american)\b/i,
  /\b(muslim|jewish|christian|hindu|buddhist|sikh|atheist|islam|judaism)\b/i,
  /\b(disabled|disability|autism|autistic|adhd|depression|diabet(?:es|ic)|cancer|pregnant)\b/i,
  /\b(gay|lesbian|bisexual|homosexual|heterosexual|trans(?:gender)?|queer)\b/i,
  /\b(democrat|republican|labour party|conservative party|maga)\b/i,
  /\b(illegal immigrant|undocumented|asylum[- ]seeker|citizenship|visa status|green card)\b/i,
];

export function hitsProhibited(text: string): boolean {
  return PATTERNS.some((re) => re.test(text));
}
