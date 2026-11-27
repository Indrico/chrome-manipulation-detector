export const onlineOrigin = import.meta.env.MD_ONLINE_ORIGIN ?? "";
export const groqOrigin =
  import.meta.env.MD_GROQ_ORIGIN ?? "https://api.groq.com";
const origin = new URL(onlineOrigin || groqOrigin);
export const onlinePermission = {
  origins: [`${origin.protocol}//${origin.hostname}/*`],
};
