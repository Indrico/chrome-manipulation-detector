export const addressee = "(?:kamu|anda|you(?:'re| are)?)\\s+";
export const condition =
  "(?:(?:kalau|jika)\\s+(?:(?:kamu|anda)\\s+)?|if you\\s+)";
export const disagreement =
  "(?:tidak (?:setuju|dukung|mendukung|support|agree)|(?:don't|do not) (?:agree|support)|disagree)\\b";
export const clauseBreak =
  "(?:[,;]\\s*(?:(?:berarti|maka|then)\\s+)?|\\s+(?:berarti|maka|then)\\s+)";
export const fromDisagreement =
  "^" + condition + disagreement + "[^,;.!?]{0,100}" + clauseBreak;
export const lostCare =
  "(?:tidak (?:peduli|sayang)|(?:don't|do not) care)\\s+(?:sama|dengan|pada|tentang|about)\\b";
